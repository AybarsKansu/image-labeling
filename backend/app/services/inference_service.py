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
        model_name: str = "yolo26x-seg.pt",
        confidence: float = 0.5,
        tile_size: int = 640,
        tile_overlap: float = 0.25,
        nms_threshold: float = 0.4,
        max_det: int = 300,
        enable_tiling: bool = True
    ) -> List[Detection]:
        """
        Performs object detection on an image (tiled or standard).
        Supports Segmentation, OBB, Pose, and Object Detection models.
        
        Args:
            img: OpenCV image (BGR)
            model_name: Model to use
            confidence: Detection confidence threshold
            tile_size: Size of tiles
            tile_overlap: Overlap between tiles
            nms_threshold: NMS IoU threshold
            max_det: Maximum detections to return
            enable_tiling: Whether to use SAHI tiling
            
        Returns:
            List of Detection objects
        """
        img_h, img_w = img.shape[:2]
        all_detections = []
        
        model = self._model_manager.get_model(model_name)
        if not model:
            raise ValueError(f"Model {model_name} not found")

        # --- PATH A: Standard Inference (No Tiling) ---
        if not enable_tiling:
            print(f"Running standard inference on full image ({img_w}x{img_h})...")
            results = model(
                img,
                retina_masks=True,
                conf=confidence,
                iou=nms_threshold,
                agnostic_nms=True,
                max_det=max_det,
                verbose=False
            )
            result = results[0]
            
            # Use the dispatcher to parse results
            all_detections = self._parse_yolo_result(result)
            
            print(f"Standard inference found {len(all_detections)} objects.")
            return all_detections

        # --- PATH B: Tiled Inference (SAHI) ---
        slices = get_slices(img_h, img_w, tile_size=tile_size, overlap=tile_overlap)
        print(f"Slicing image ({img_w}x{img_h}) into {len(slices)} tiles...")
        
        raw_detections = []
        
        for (sx1, sy1, sx2, sy2) in slices:
            tile = img[sy1:sy2, sx1:sx2]
            if tile.size == 0:
                continue
            
            # Run inference on tile
            results = model(
                tile, 
                retina_masks=True, 
                conf=max(confidence, 0.35), # Slightly lower for tiles to capture small stuff 
                iou=0.6, # Relaxed within tile
                agnostic_nms=True, 
                verbose=False
            )
            result = results[0]
            
            # Use dispatcher with offset
            tile_detections = self._parse_yolo_result(result, offset=(sx1, sy1))
            all_detections.extend(tile_detections)
        
        if not all_detections:
            return []
        
        # Prepare for NMS
        # Convert Detection objects back to box format for safe_nms
        # We need to compute bounding boxes from the polygons/points
        nms_boxes = []
        nms_scores = []
        
        for det in all_detections:
            # Calculate bbox from points [x1, y1, x2, y2, ...]
            xs = det.points[0::2]
            ys = det.points[1::2]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            w = max_x - min_x
            h = max_y - min_y
            
            nms_boxes.append([min_x, min_y, w, h])
            nms_scores.append(det.confidence)

        # Apply Global NMS to merge overlapping tiles
        keep_indices = safe_nms(nms_boxes, nms_scores, iou_threshold=0.35) # Stricter global NMS
        
        final_detections = [all_detections[i] for i in keep_indices]
        
        # Limit to max_det (sorted by confidence descending)
        final_detections.sort(key=lambda x: x.confidence, reverse=True)
        if len(final_detections) > max_det:
            final_detections = final_detections[:max_det]
        
        print(f"Merged {len(all_detections)} raw detections into {len(final_detections)} final objects (Max: {max_det}).")
        return final_detections

    def _parse_yolo_result(self, result: Any, offset: Tuple[int, int] = (0, 0)) -> List[Detection]:
        """
        Dispatcher method to parse YOLO results based on available data (Masks, OBB, Pose, Boxes).
        
        Args:
            result: Ultralytics result object
            offset: (x, y) offset to apply to coordinates (for tiling)
            
        Returns:
            List of Detection objects
        """
        # Prioritize rich outputs: Masks > OBB > Keypoints > Boxes
        if result.masks is not None:
            return self._extract_segmentation(result, offset)
        elif result.obb is not None:
            return self._extract_obb(result, offset)
        elif result.keypoints is not None:
            return self._extract_pose(result, offset)
        elif result.boxes is not None:
            return self._extract_detection(result, offset)
        
        return []

    def _extract_segmentation(self, result: Any, offset: Tuple[int, int]) -> List[Detection]:
        """Extracts segmentation masks as polygons."""
        detections = []
        ox, oy = offset
        polygons = masks_to_polygons(result.masks)
        
        for i, poly in enumerate(polygons):
            cls_id = int(result.boxes.cls[i])
            conf = float(result.boxes.conf[i])
            label = result.names[cls_id]
            
            # Apply offset
            if ox != 0 or oy != 0:
                poly = [c + (ox if i % 2 == 0 else oy) for i, c in enumerate(poly)]
            
            detections.append(Detection(
                id=str(uuid.uuid4()),
                label=label,
                points=poly,
                type="poly",
                confidence=conf
            ))
        return detections

    def _extract_obb(self, result: Any, offset: Tuple[int, int]) -> List[Detection]:
        """Extracts OBB as 4-point polygons."""
        detections = []
        ox, oy = offset
        
        # result.obb.xyxyxyxy -> [N, 4, 2]
        obbs = result.obb.xyxyxyxy.cpu().numpy()
        
        for i, obb_pts in enumerate(obbs):
            cls_id = int(result.obb.cls[i])
            conf = float(result.obb.conf[i])
            label = result.names[cls_id]
            
            # Flatten to [x1, y1, x2, y2, x3, y3, x4, y4]
            poly = obb_pts.flatten().tolist()
            
            # Apply offset
            if ox != 0 or oy != 0:
                poly = [c + (ox if k % 2 == 0 else oy) for k, c in enumerate(poly)]
            
            detections.append(Detection(
                id=str(uuid.uuid4()),
                label=label,
                points=poly,
                type="poly", # OBB treated as polygon
                confidence=conf
            ))
        return detections

    def _extract_pose(self, result: Any, offset: Tuple[int, int]) -> List[Detection]:
        """
        Extracts Pose/Keypoints. 
        Currently maps the bounding box to a polygon as valid geometry.
        """
        detections = []
        ox, oy = offset
        
        # Fallback to boxes for geometry
        boxes = result.boxes.xyxy.cpu().numpy()
        
        for i, box in enumerate(boxes):
            cls_id = int(result.boxes.cls[i])
            conf = float(result.boxes.conf[i])
            label = result.names[cls_id]
            
            x1, y1, x2, y2 = box
            
            # Create rectangular polygon
            poly = [x1, y1, x2, y1, x2, y2, x1, y2]
            
            # Apply offset
            if ox != 0 or oy != 0:
                poly = [c + (ox if k % 2 == 0 else oy) for k, c in enumerate(poly)]
                
            detections.append(Detection(
                id=str(uuid.uuid4()),
                label=label,
                points=poly,
                type="poly",
                confidence=conf
            ))
        return detections

    def _extract_detection(self, result: Any, offset: Tuple[int, int]) -> List[Detection]:
        """Extracts standard object detection boxes as polygons."""
        detections = []
        ox, oy = offset
        
        boxes = result.boxes.xyxy.cpu().numpy()
        
        for i, box in enumerate(boxes):
            cls_id = int(result.boxes.cls[i])
            conf = float(result.boxes.conf[i])
            label = result.names[cls_id]
            
            x1, y1, x2, y2 = box
            
            # Create rectangular polygon
            poly = [x1, y1, x2, y1, x2, y2, x1, y2]
            
            # Apply offset
            if ox != 0 or oy != 0:
                poly = [c + (ox if k % 2 == 0 else oy) for k, c in enumerate(poly)]
            
            detections.append(Detection(
                id=str(uuid.uuid4()),
                label=label,
                points=poly,
                type="poly",
                confidence=conf
            ))
        return detections
    
    def segment_box(
        self,
        img: np.ndarray,
        box: Tuple[int, int, int, int],
        model_name: str = "sam2.1_l.pt",
        confidence: float = 0.2,
        text_prompt: Optional[str] = None,
        enable_yolo_verification: bool = False
    ) -> Tuple[List[Detection], List[Suggestion]]:
        """
        Segments objects within a bounding box.
        
        Args:
            img: OpenCV image (BGR)
            box: (x, y, w, h) bounding box
            model_name: Model to use
            confidence: Confidence threshold
            text_prompt: Optional label override
            enable_yolo_verification: Validate text prompt with YOLO
            
        Returns:
            Tuple of (detections, suggestions)
        """
        x, y, w, h = box
        img_h, img_w = img.shape[:2]
        x1, y1, x2, y2 = x, y, x + w, y + h
        
        print(f"DEBUG: segment_box image {img_w}x{img_h}, box: {x},{y} {w}x{h}, model: {model_name}, verification: {enable_yolo_verification}")
        
        detections = []
        suggestions = []
        
        # YoloE validation if text_prompt is present AND enabled
        validated_label = text_prompt
        if text_prompt and text_prompt.strip() and enable_yolo_verification:
            validated_label = self._validate_with_yoloe(
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
    
    def _validate_with_yoloe(
        self,
        img: np.ndarray,
        box_xyxy: Tuple[int, int, int, int],
        text_prompt: str,
        confidence: float
    ) -> str:
        """
        Validates text prompt using YoloE-26 (Open Vocabulary).
        Returns validated label or 'object' if not found.
        """
        try:
            from ultralytics import YOLO
            
            print(f"DEBUG: Running YoloE-26 Pre-Check for '{text_prompt}'")
            
            # Using the new YoloE-26 Open-Vocab model
            yoloe_name = "yolo26x-objv1-150.pt"
            yoloe_model = self._model_manager.get_model(yoloe_name)
            
            if not yoloe_model:
                print(f"Loading {yoloe_name} for validation...")
                yoloe_model = YOLO(yoloe_name)
                yoloe_model.to(self._model_manager.device)
                self._model_manager._models[yoloe_name] = yoloe_model
            
            # Set classes and run on crop
            # Check if model supports set_classes (YOLO-World)
            supports_set_classes = hasattr(yoloe_model, 'set_classes')
            if supports_set_classes:
                yoloe_model.set_classes([text_prompt])
            
            x1, y1, x2, y2 = box_xyxy
            img_h, img_w = img.shape[:2]
            cx1 = max(0, x1)
            cy1 = max(0, y1)
            cx2 = min(img_w, x2)
            cy2 = min(img_h, y2)
            crop = img[cy1:cy2, cx1:cx2]
            
            if crop.size == 0:
                return "object"
            
            val_results = yoloe_model.predict(crop, conf=confidence, verbose=False)
            
            if len(val_results) > 0 and len(val_results[0].boxes) > 0:
                # If we couldn't use set_classes, we must verify the detected label matches the prompt
                if not supports_set_classes:
                    # Check if any detection matches the text_prompt (case-insensitive)
                    found_match = False
                    for cls_id in val_results[0].boxes.cls:
                        label = val_results[0].names[int(cls_id)]
                        if label.lower() == text_prompt.lower():
                            found_match = True
                            break
                    
                    if not found_match:
                         print(f"DEBUG: Validation Failed. Found objects but none matched '{text_prompt}'.")
                         return "object"

                print(f"DEBUG: Validation Passed. Found {len(val_results[0].boxes)} {text_prompt}(s)")
                return text_prompt
            
            print(f"DEBUG: Validation Failed. No '{text_prompt}' found in box. Using 'object'.")
            return "object"
            
        except Exception as e:
            print(f"WARNING: YoloE Validation failed: {e}. Using original prompt.")
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
