"""
Inference Service.
Business logic for running YOLO/SAM inference.
"""

import uuid
from typing import List, Optional, Tuple, Any
import numpy as np

from app.services.model_manager import ModelManager, get_model_manager
from app.utils.image import get_slices, safe_nms, masks_to_polygons, crop_image
from app.schemas.inference import Detection, Suggestion


class InferenceService:
    """
    Handles all ML inference operations.
    Uses ModelManager for model access.
    """
    
    def __init__(self, model_manager: ModelManager = None):
        self._model_manager = model_manager or get_model_manager()
    
    @property
    def model_manager(self) -> ModelManager:
        return self._model_manager
    
    def detect_all(
        self,
        img: np.ndarray,
        model_name: str = "yolov8m-seg.pt",
        confidence: float = 0.5,
        tile_size: int = 640,
        tile_overlap: float = 0.25,
        nms_threshold: float = 0.4
    ) -> List[Detection]:
        """
        Performs tiled object detection on an image.
        
        Args:
            img: OpenCV image (BGR)
            model_name: Model to use
            confidence: Detection confidence threshold
            tile_size: Size of tiles
            tile_overlap: Overlap between tiles
            nms_threshold: NMS IoU threshold
            
        Returns:
            List of Detection objects
        """
        img_h, img_w = img.shape[:2]
        slices = get_slices(img_h, img_w, tile_size=tile_size, overlap=tile_overlap)
        
        all_detections = []
        print(f"Slicing image ({img_w}x{img_h}) into {len(slices)} tiles...")
        
        model = self._model_manager.get_model(model_name)
        if not model:
            raise ValueError(f"Model {model_name} not found")
        
        for (sx1, sy1, sx2, sy2) in slices:
            tile = img[sy1:sy2, sx1:sx2]
            if tile.size == 0:
                continue
            
            # Run inference on tile
            results = model(
                tile, 
                retina_masks=True, 
                conf=confidence, 
                iou=0.5, 
                agnostic_nms=True, 
                verbose=False
            )
            result = results[0]
            
            if result.masks:
                polygons = masks_to_polygons(result.masks)
                if result.boxes:
                    for i, poly in enumerate(polygons):
                        cls_id = int(result.boxes.cls[i])
                        conf = float(result.boxes.conf[i])
                        
                        # Translate polygon to global coordinates
                        global_poly = []
                        min_x, min_y = float('inf'), float('inf')
                        max_x, max_y = float('-inf'), float('-inf')
                        
                        for j in range(0, len(poly), 2):
                            px = poly[j] + sx1
                            py = poly[j+1] + sy1
                            global_poly.extend([px, py])
                            
                            min_x = min(min_x, px)
                            min_y = min(min_y, py)
                            max_x = max(max_x, px)
                            max_y = max(max_y, py)
                        
                        # Box for NMS: [x, y, w, h]
                        bw = max_x - min_x
                        bh = max_y - min_y
                        box = [min_x, min_y, bw, bh]
                        
                        all_detections.append({
                            "box": box,
                            "score": conf,
                            "class_id": cls_id,
                            "label": result.names[cls_id],
                            "points": global_poly
                        })
        
        if not all_detections:
            return []
        
        # Apply NMS
        nms_boxes = [d["box"] for d in all_detections]
        nms_scores = [d["score"] for d in all_detections]
        keep_indices = safe_nms(nms_boxes, nms_scores, iou_threshold=nms_threshold)
        
        # Build final detections
        final_detections = []
        for idx in keep_indices:
            det = all_detections[idx]
            final_detections.append(Detection(
                id=str(uuid.uuid4()),
                label=det["label"],
                points=det["points"],
                type="poly",
                confidence=det["score"]
            ))
        
        print(f"Merged {len(all_detections)} raw detections into {len(final_detections)} final objects.")
        return final_detections
    
    def segment_box(
        self,
        img: np.ndarray,
        box: Tuple[int, int, int, int],
        model_name: str = "sam2.1_l.pt",
        confidence: float = 0.2,
        text_prompt: Optional[str] = None
    ) -> Tuple[List[Detection], List[Suggestion]]:
        """
        Segments objects within a bounding box.
        
        Args:
            img: OpenCV image (BGR)
            box: (x, y, w, h) bounding box
            model_name: Model to use
            confidence: Confidence threshold
            text_prompt: Optional label override
            
        Returns:
            Tuple of (detections, suggestions)
        """
        x, y, w, h = box
        img_h, img_w = img.shape[:2]
        x1, y1, x2, y2 = x, y, x + w, y + h
        
        print(f"DEBUG: segment_box image {img_w}x{img_h}, box: {x},{y} {w}x{h}, model: {model_name}")
        
        detections = []
        suggestions = []
        
        # YOLO-World validation if text_prompt is present
        validated_label = text_prompt
        if text_prompt and text_prompt.strip():
            validated_label = self._validate_with_yolo_world(
                img, (x1, y1, x2, y2), text_prompt.strip(), confidence
            )
        
        # Check if using SAM model
        is_sam = "sam" in model_name.lower()
        
        if is_sam:
            detections = self._segment_with_sam(
                img, (x1, y1, x2, y2), model_name, validated_label
            )
        else:
            detections, suggestions = self._segment_with_yolo(
                img, (x1, y1, x2, y2), model_name, validated_label
            )
        
        return detections, suggestions
    
    def _validate_with_yolo_world(
        self,
        img: np.ndarray,
        box_xyxy: Tuple[int, int, int, int],
        text_prompt: str,
        confidence: float
    ) -> str:
        """
        Validates text prompt using YOLO-World.
        Returns validated label or 'object' if not found.
        """
        try:
            from ultralytics import YOLO
            
            print(f"DEBUG: Running YOLO-World Pre-Check for '{text_prompt}'")
            
            yw_name = "yolov8l-world.pt"
            yw_model = self._model_manager.get_model(yw_name)
            
            if not yw_model:
                print(f"Loading {yw_name} for validation...")
                yw_model = YOLO(yw_name)
                yw_model.to(self._model_manager.device)
                self._model_manager._models[yw_name] = yw_model
            
            # Set classes and run on crop
            yw_model.set_classes([text_prompt])
            
            x1, y1, x2, y2 = box_xyxy
            img_h, img_w = img.shape[:2]
            cx1 = max(0, x1)
            cy1 = max(0, y1)
            cx2 = min(img_w, x2)
            cy2 = min(img_h, y2)
            crop = img[cy1:cy2, cx1:cx2]
            
            if crop.size == 0:
                return "object"
            
            val_results = yw_model.predict(crop, conf=confidence, verbose=False)
            
            if len(val_results) > 0 and len(val_results[0].boxes) > 0:
                print(f"DEBUG: Validation Passed. Found {len(val_results[0].boxes)} {text_prompt}(s)")
                return text_prompt
            
            print(f"DEBUG: Validation Failed. No '{text_prompt}' found in box. Using 'object'.")
            return "object"
            
        except Exception as e:
            print(f"WARNING: YOLO-World Validation failed: {e}. Using original prompt.")
            return text_prompt
    
    def _segment_with_sam(
        self,
        img: np.ndarray,
        box_xyxy: Tuple[int, int, int, int],
        model_name: str,
        label: Optional[str]
    ) -> List[Detection]:
        """Segments using SAM with bbox prompt."""
        print("DEBUG: Using SAM path")
        
        sam_model = self._model_manager.get_model(model_name)
        if not sam_model:
            SAM = self._model_manager.get_sam_class()
            if SAM:
                sam_model = SAM(model_name)
                sam_model.to(self._model_manager.device)
                self._model_manager._models[model_name] = sam_model
            else:
                raise ValueError(f"SAM Model {model_name} not found")
        
        x1, y1, x2, y2 = box_xyxy
        results = sam_model(img, bboxes=[[x1, y1, x2, y2]], verbose=False)
        
        print(f"DEBUG: SAM results masks: {len(results[0].masks) if results[0].masks else 'None'}")
        
        detections = []
        if results[0].masks:
            polygons = masks_to_polygons(results[0].masks)
            final_label = label.strip() if label and label.strip() else "Object"
            
            for poly in polygons:
                detections.append(Detection(
                    id=str(uuid.uuid4()),
                    label=final_label,
                    points=poly,
                    type="poly"
                ))
        
        return detections
    
    def _segment_with_yolo(
        self,
        img: np.ndarray,
        box_xyxy: Tuple[int, int, int, int],
        model_name: str,
        label: Optional[str]
    ) -> Tuple[List[Detection], List[Suggestion]]:
        """Segments using YOLO on cropped region."""
        print("DEBUG: Using YOLO path")
        
        x1, y1, x2, y2 = box_xyxy
        img_h, img_w = img.shape[:2]
        
        cx1 = max(0, x1)
        cy1 = max(0, y1)
        cx2 = min(img_w, x2)
        cy2 = min(img_h, y2)
        
        crop = img[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            return [], []
        
        model = self._model_manager.get_model(model_name)
        if not model:
            raise ValueError(f"Model {model_name} not found")
        
        results = model(
            crop, 
            retina_masks=True, 
            conf=0.05, 
            iou=0.8, 
            agnostic_nms=False, 
            max_det=20
        )
        result = results[0]
        
        print(f"DEBUG: YOLO result boxes: {len(result.boxes) if result.boxes else 0}, masks: {len(result.masks) if result.masks else 'None'}")
        
        detections = []
        suggestions = []
        
        # Collect suggestions
        if result.boxes:
            for k, cls_id in enumerate(result.boxes.cls):
                lbl = result.names[int(cls_id)]
                cnf = float(result.boxes.conf[k])
                suggestions.append(Suggestion(label=lbl, score=cnf))
        
        # Primary detection
        if result.masks:
            polygons = masks_to_polygons(result.masks)
            if len(result.boxes.conf) > 0:
                best_idx = int(result.boxes.conf.argmax())
                if float(result.boxes.conf[best_idx]) > 0.10:
                    poly = polygons[best_idx]
                    cls_id = int(result.boxes.cls[best_idx])
                    
                    final_label = label.strip() if label and label.strip() else result.names[cls_id]
                    
                    # Translate coordinates
                    global_poly = []
                    for j in range(0, len(poly), 2):
                        px = poly[j] + cx1
                        py = poly[j+1] + cy1
                        global_poly.extend([px, py])
                    
                    detections.append(Detection(
                        id=str(uuid.uuid4()),
                        label=final_label,
                        points=global_poly,
                        type="poly"
                    ))
        
        # Fallback: box to polygon if no mask
        elif result.boxes and len(result.boxes) > 0:
            print("DEBUG: No masks found, falling back to box")
            best_idx = int(result.boxes.conf.argmax())
            box_xyxy = result.boxes.xyxy[best_idx].tolist()
            bx1, by1, bx2, by2 = box_xyxy
            cls_id = int(result.boxes.cls[best_idx])
            
            # Translate to global
            bx1 += cx1
            bx2 += cx1
            by1 += cy1
            by2 += cy1
            
            poly = [bx1, by1, bx2, by1, bx2, by2, bx1, by2]
            final_label = label.strip() if label and label.strip() else result.names[cls_id]
            
            detections.append(Detection(
                id=str(uuid.uuid4()),
                label=final_label,
                points=poly,
                type="poly"
            ))
        
        # Unique suggestions
        suggestions.sort(key=lambda x: x.score, reverse=True)
        unique_suggestions = []
        seen = set()
        for s in suggestions:
            if s.label not in seen:
                unique_suggestions.append(s)
                seen.add(s.label)
            if len(unique_suggestions) >= 3:
                break
        
        return detections, unique_suggestions
    
    def refine_polygon(
        self,
        img: np.ndarray,
        points: List[float],
        model_name: str = "sam2.1_l.pt"
    ) -> Optional[List[float]]:
        """
        Refines a rough polygon using SAM.
        
        Args:
            img: OpenCV image
            points: Flat polygon points
            model_name: SAM model to use
            
        Returns:
            Refined polygon points or None
        """
        from app.services.geometry_service import polygon_bounding_box
        
        if not points or len(points) < 4:
            return None
        
        # Calculate bounding box
        x_min, y_min, x_max, y_max = polygon_bounding_box(points)
        box = [x_min, y_min, x_max, y_max]
        
        # Ensure SAM model
        if "sam" not in model_name.lower():
            model_name = "sam2.1_l.pt"
        
        sam_model = self._model_manager.get_model(model_name)
        if not sam_model:
            SAM = self._model_manager.get_sam_class()
            if SAM:
                sam_model = SAM(model_name)
                sam_model.to(self._model_manager.device)
                self._model_manager._models[model_name] = sam_model
            else:
                return None
        
        results = sam_model(img, bboxes=[box], verbose=False)
        
        if results[0].masks:
            polygons = masks_to_polygons(results[0].masks)
            # Return largest polygon
            best_poly = None
            max_len = 0
            for poly in polygons:
                if len(poly) > max_len:
                    max_len = len(poly)
                    best_poly = poly
            return best_poly
        
        return None


def get_inference_service():
    """FastAPI dependency for InferenceService."""
    return InferenceService(get_model_manager())
