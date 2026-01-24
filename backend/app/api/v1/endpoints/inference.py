"""
Inference API endpoints.
Detection, segmentation, and refinement routes.
"""

import json
from typing import Annotated
from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException

from app.services.model_manager import ModelManager, get_model_manager
from app.services.inference_service import InferenceService, get_inference_service
from app.utils.image import decode_image
from app.schemas.inference import (
    DetectAllResponse, 
    SegmentBoxResponse, 
    RefinePolygonResponse,
    SegmentByTextResponse,
    Detection,
    BoundingBox
)

router = APIRouter(tags=["inference"])


@router.post("/detect-all", response_model=DetectAllResponse)
async def detect_all(
    file: UploadFile = File(...),
    model_name: str = Form("yolo26x-seg.pt"),
    confidence: float = Form(0.5),
    nms_threshold: float = Form(0.25), # Aggressive NMS default
    max_det: int = Form(300),
    enable_tiling: bool = Form(False), # Disable tiling by default
    inference_service = Depends(get_inference_service)
):
    """
    Detects ALL objects using tiled inference.
    Splits image into overlapping tiles, runs detection, and merges results with NMS.
    """
    try:
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        
        detections = inference_service.detect_all(
            img=img,
            model_name=model_name,
            confidence=confidence,
            max_det=max_det,
            enable_tiling=enable_tiling,
            nms_threshold=nms_threshold
        )
        
        return DetectAllResponse(detections=detections)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error in /detect-all: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment-box", response_model=SegmentBoxResponse)
async def segment_box(
    file: UploadFile = File(...),
    box_json: str = Form(...),
    model_name: str = Form("sam2.1_l.pt"),
    confidence: float = Form(0.2),
    text_prompt: str = Form(None),
    enable_yolo_verification: bool = Form(False),
    inference_service = Depends(get_inference_service)
):
    """
    Segments objects within a bounding box.
    - If SAM model: Uses native bbox prompting
    - If YOLO model: Crops image and runs detection
    """
    try:
        # Parse box
        box_coords = json.loads(box_json)
        box = BoundingBox.from_list(box_coords)
        
        if box.w <= 0 or box.h <= 0:
            raise HTTPException(status_code=400, detail="Invalid box dimensions")
        
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        
        detections, suggestions = inference_service.segment_box(
            img=img,
            box=(int(box.x), int(box.y), int(box.w), int(box.h)),
            model_name=model_name,
            confidence=confidence,
            text_prompt=text_prompt,
            enable_yolo_verification=enable_yolo_verification
        )
        
        return SegmentBoxResponse(detections=detections, suggestions=suggestions)
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid box_json format")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error in /segment-box: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refine-polygon", response_model=RefinePolygonResponse)
async def refine_polygon(
    file: UploadFile = File(...),
    points_json: str = Form(...),
    model_name: str = Form("sam2.1_l.pt"),
    inference_service = Depends(get_inference_service)
):
    """
    Refines a rough polygon using SAM 2.
    Calculates bounding box of input polygon and uses it as SAM prompt.
    """
    try:
        points = json.loads(points_json)
        if not points or len(points) < 4:
            raise HTTPException(status_code=400, detail="Invalid points")
        
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        
        refined_points = inference_service.refine_polygon(
            img=img,
            points=points,
            model_name=model_name
        )
        
        if refined_points is None:
            raise HTTPException(status_code=400, detail="Could not refine polygon")
        
        return RefinePolygonResponse(points=refined_points, label="refined")
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid points_json format")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /refine-polygon: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment-by-text", response_model=SegmentByTextResponse)
async def segment_by_text(
    file: UploadFile = File(...),
    text_prompt: str = Form(...),
    sam_model_name: str = Form("sam2.1_l.pt"),
    box_confidence: float = Form(0.25),
    iou_threshold: float = Form(0.45),
    model_manager = Depends(get_model_manager)
):
    """
    Two-stage pipeline:
    1. YOLO-World detects objects based on text prompt -> Bounding Boxes
    2. SAM takes boxes as prompts -> Precise Segmentation Masks
    """
    try:
        from ultralytics import YOLO
        from app.utils.image import masks_to_polygons
        import uuid
        
        # Load YoloE-26 (Open-Vocab)
        yoloe_name = "yolo26x-objv1-150.pt"
        yoloe_model = model_manager.get_model(yoloe_name)
        if not yoloe_model:
            try:
                print(f"Loading {yoloe_name} on demand...")
                yoloe_model = YOLO(yoloe_name)
                yoloe_model.to(model_manager.device)
                model_manager._models[yoloe_name] = yoloe_model
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to load YoloE: {e}")
        
        # Set classes
        prompts = [p.strip() for p in text_prompt.split(',') if p.strip()]
        if not prompts:
            raise HTTPException(status_code=400, detail="Empty text prompt")
        
        if hasattr(yoloe_model, 'set_classes'):
            yoloe_model.set_classes(prompts)
        else:
            print(f"Model {yoloe_name} does not support set_classes. Filtering results manually.")
        
        # Process image
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        
        # Stage 1: Detection
        results = yoloe_model.predict(img, conf=box_confidence, iou=iou_threshold, verbose=False)
        if not results or not results[0].boxes:
            return SegmentByTextResponse(detections=[])
        
        boxes = results[0].boxes
        
        # Filter boxes if we couldn't filter pre-inference
        valid_indices = []
        if not hasattr(yoloe_model, 'set_classes'):
            for i, cls_id in enumerate(boxes.cls.cpu().numpy()):
                label = results[0].names[int(cls_id)]
                if label in prompts:
                    valid_indices.append(i)
            
            if not valid_indices:
                return SegmentByTextResponse(detections=[])
            
            # Sub-select boxes
            # Note: Indexing boxes directly might return a Boxes object or tokens, safest to convert to numpy first
            # But let's work with the numpy arrays we extracted below
            pass
        else:
             valid_indices = list(range(len(boxes)))

        bboxes = boxes.xyxy.cpu().numpy()[valid_indices]
        class_ids = boxes.cls.cpu().numpy().astype(int)[valid_indices]
        confidences = boxes.conf.cpu().numpy()[valid_indices]
        
        if len(bboxes) == 0:
            return SegmentByTextResponse(detections=[])
        
        # Stage 2: SAM segmentation
        sam_model = model_manager.get_model(sam_model_name)
        if not sam_model:
            raise HTTPException(status_code=400, detail=f"SAM Model {sam_model_name} not found")
        
        # Validate SAM model type
        SAM = model_manager.get_sam_class()
        if SAM is None or not isinstance(sam_model, SAM):
            raise HTTPException(
                status_code=400,
                detail=f"Model '{sam_model_name}' is not a valid SAM model"
            )
        
        bboxes_list = bboxes.tolist()
        sam_results = sam_model(img, bboxes=bboxes_list, verbose=False)
        
        detections = []
        if sam_results[0].masks:
            polygons = masks_to_polygons(sam_results[0].masks)
            
            for i, poly in enumerate(polygons):
                if i >= len(class_ids):
                    break
                
                cls_id = class_ids[i]
                label = results[0].names[int(cls_id)]
                score = float(confidences[i])
                
                detections.append(Detection(
                    id=str(uuid.uuid4()),
                    label=label,
                    points=poly,
                    type="poly",
                    confidence=score
                ))
        
        return SegmentByTextResponse(detections=detections)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /segment-by-text: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-label/grounding-dino", response_model=DetectAllResponse)
async def auto_label_grounding_dino(
    file: UploadFile = File(...),
    text_prompt: str = Form(...),
    box_threshold: float = Form(0.35),
    text_threshold: float = Form(0.25),
    inference_mode: str = Form("standard"),
    tile_size: int = Form(640),
    tile_overlap: float = Form(0.25),
    sam_sensitivity: float = Form(0.5),
    sam_model_name: str = Form("sam2.1_l.pt"),
    use_sam: bool = Form(True),
    inference_service = Depends(get_inference_service)
):
    """
    Zero-shot detection using Grounding DINO + SAM (Advanced Modes).
    """
    try:
        from app.services.grounding_dino import grounding_dino_service
        from app.utils.image import masks_to_polygons
        import uuid
        import cv2
        from PIL import Image
        
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        
        # Convert OpenCV image (numpy) to PIL Image
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(img_rgb)
        
        # Load SAM model if needed
        model_manager = inference_service.model_manager
        sam_model = None
        
        if inference_mode == "smart_focus" or use_sam:
            sam_model = model_manager.get_model(sam_model_name)
            if not sam_model:
                SAM = model_manager.get_sam_class()
                if SAM:
                    try:
                        sam_model = SAM(sam_model_name)
                        sam_model.to(model_manager.device)
                        model_manager._models[sam_model_name] = sam_model
                    except Exception as e:
                        print(f"Failed to load SAM model: {e}")
                        sam_model = None

        candidate_sam_model = sam_model if inference_mode == "smart_focus" else None

        detections_data = grounding_dino_service.predict(
            image=pil_image,
            text_prompt=text_prompt,
            box_threshold=box_threshold,
            text_threshold=text_threshold,
            inference_mode=inference_mode,
            tile_size=tile_size,
            tile_overlap=tile_overlap,
            sam_model=candidate_sam_model,
            sam_sensitivity=sam_sensitivity
        )
        
        if not detections_data:
            return DetectAllResponse(detections=[])
            
        # Prepare boxes for SAM
        bboxes_list = [d["bbox"] for d in detections_data]
        
        detections = []
        sam_succeeded = False

        if use_sam and sam_model:
            try:
                # SAM expects numpy image (BGR is fine for Ultralytics)
                sam_results = sam_model(img, bboxes=bboxes_list, verbose=False)
                
                if sam_results and sam_results[0].masks:
                    polygons = masks_to_polygons(sam_results[0].masks)
                    
                    if len(polygons) == len(detections_data):
                        sam_succeeded = True
                        for i, (poly, d) in enumerate(zip(polygons, detections_data)):
                            detections.append(Detection(
                                id=str(uuid.uuid4()),
                                label=d["label"],
                                confidence=d["score"],
                                points=poly,
                                type="poly"
                            ))
                    else:
                        print(f"SAM returned {len(polygons)} polygons for {len(detections_data)} boxes. Alignment issue.")
            except Exception as e:
                print(f"SAM inference failed: {e}")

        # Fallback to boxes if SAM wasn't used or failed
        if not sam_succeeded:
            for d in detections_data:
                bbox = d["bbox"]
                x1, y1, x2, y2 = bbox
                points = [x1, y1, x2, y1, x2, y2, x1, y2]
                
                detections.append(Detection(
                    id=str(uuid.uuid4()),
                    label=d["label"],
                    confidence=d["score"],
                    points=points,
                    type="box" # Fallback to box
                ))
            
        return DetectAllResponse(detections=detections)

    except Exception as e:
        print(f"Error in /auto-label/grounding-dino: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/segment-lasso", response_model=SegmentBoxResponse)
async def segment_lasso(
    file: UploadFile = File(...),
    points_json: str = Form(...),
    model_name: str = Form("yolo26x-seg.pt"),
    confidence: float = Form(0.2),
    inference_service = Depends(get_inference_service)
):
    """
    Detects objects within a freehand lasso polygon.
    Masks image and runs detection on masked region.
    """
    import cv2
    import numpy as np
    import uuid
    from app.utils.image import masks_to_polygons
    from app.schemas.inference import Suggestion
    
    try:
        points = json.loads(points_json)
        if len(points) < 6:
            raise HTTPException(status_code=400, detail="Not enough points")
        
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        h, w = img.shape[:2]
        
        # Create mask from lasso
        pts_np = np.array(points).reshape((-1, 2)).astype(np.int32)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [pts_np], 255)
        
        # Apply mask
        mask_3ch = cv2.merge([mask, mask, mask])
        masked_img = cv2.bitwise_and(img, mask_3ch)
        
        # Crop to bounding rect
        x, y, bw, bh = cv2.boundingRect(pts_np)
        x = max(0, x)
        y = max(0, y)
        bw = min(w - x, bw)
        bh = min(h - y, bh)
        
        if bw <= 0 or bh <= 0:
            return SegmentBoxResponse(detections=[], suggestions=[])
        
        crop = masked_img[y:y+bh, x:x+bw]
        
        # Run inference
        model = inference_service.model_manager.get_model(model_name)
        if not model:
            raise HTTPException(status_code=400, detail="Model not found")
        
        results = model(crop, retina_masks=True, conf=0.05, iou=0.8, agnostic_nms=False, max_det=20)
        result = results[0]
        
        detections = []
        suggestions = []
        
        if result.boxes:
            for k, cls_id in enumerate(result.boxes.cls):
                lbl = result.names[int(cls_id)]
                cnf = float(result.boxes.conf[k])
                suggestions.append(Suggestion(label=lbl, score=cnf))
        
        # Unique suggestions
        suggestions.sort(key=lambda s: s.score, reverse=True)
        unique = []
        seen = set()
        for s in suggestions:
            if s.label not in seen:
                unique.append(s)
                seen.add(s.label)
            if len(unique) >= 3:
                break
        suggestions = unique
        
        # Primary detection
        if result.masks:
            polygons = masks_to_polygons(result.masks)
            if len(result.boxes.conf) > 0:
                best_idx = int(result.boxes.conf.argmax())
                if float(result.boxes.conf[best_idx]) > 0.10:
                    poly = polygons[best_idx]
                    cls_id = int(result.boxes.cls[best_idx])
                    label = result.names[cls_id]
                    
                    # Translate coordinates
                    global_poly = []
                    for j in range(0, len(poly), 2):
                        px = poly[j] + x
                        py = poly[j+1] + y
                        global_poly.extend([px, py])
                    
                    detections.append(Detection(
                        id=str(uuid.uuid4()),
                        label=label,
                        points=global_poly,
                        type="poly"
                    ))
        
        return SegmentBoxResponse(detections=detections, suggestions=suggestions)
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid points_json format")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /segment-lasso: {e}")
        raise HTTPException(status_code=500, detail=str(e))
