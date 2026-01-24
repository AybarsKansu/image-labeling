
import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
import torchvision.ops as ops

class GroundingDinoService:
    _instance = None
    _model = None
    _processor = None
    _device = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GroundingDinoService, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize model and processor only once."""
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading Grounding DINO on {self._device}...")
        
        try:
            model_id = "IDEA-Research/grounding-dino-base"
            self._processor = AutoProcessor.from_pretrained(model_id)
            self._model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id).to(self._device)
            print("Grounding DINO loaded successfully.")
        except Exception as e:
            print(f"Failed to load Grounding DINO: {e}")
            raise e

    def predict(
        self, 
        image: Image.Image, 
        text_prompt: str, 
        box_threshold: float = 0.35, 
        text_threshold: float = 0.25,
        inference_mode: str = "standard",
        tile_size: int = 640,
        tile_overlap: float = 0.25,
        sam_model = None,
        sam_sensitivity: float = 0.5
    ):
        """
        Run inference using Grounding DINO with advanced strategies.
        
        Args:
            image (PIL.Image): Input image.
            text_prompt (str): Text prompt.
            box_threshold (float): Detection threshold.
            text_threshold (float): Text match threshold.
            inference_mode (str): 'standard', 'tiled', or 'smart_focus'.
            tile_size (int): Tile size for tiled mode.
            tile_overlap (float): Overlap ratio.
            sam_model (Any): Loaded SAM model for smart focus.
            sam_sensitivity (float): Sensitivity for SAM proposals.
        """
        if inference_mode == "tiled":
            return self._predict_tiled(image, text_prompt, box_threshold, text_threshold, tile_size, tile_overlap)
        elif inference_mode == "smart_focus":
             return self._predict_smart_focus(image, text_prompt, box_threshold, text_threshold, sam_model, sam_sensitivity)
        else:
             return self._predict_standard(image, text_prompt, box_threshold, text_threshold)

    def _predict_tiled(self, image: Image.Image, text_prompt: str, box_threshold: float, text_threshold: float, tile_size: int, tile_overlap: float):
        from app.utils.image import get_slices
        w, h = image.size
        slices = get_slices(h, w, tile_size, tile_overlap)
        
        print(f"Running Tiled Inference: {len(slices)} tiles...")
        
        all_boxes = []
        all_scores = []
        all_labels = []
        
        for (sx1, sy1, sx2, sy2) in slices:
            tile = image.crop((sx1, sy1, sx2, sy2))
            results = self._predict_standard(tile, text_prompt, box_threshold, text_threshold)
            
            for res in results:
                bbox = res["bbox"]
                # Translate to global
                global_bbox = [
                    bbox[0] + sx1, 
                    bbox[1] + sy1, 
                    bbox[2] + sx1, 
                    bbox[3] + sy1
                ]
                all_boxes.append(global_bbox)
                all_scores.append(res["score"])
                all_labels.append(res["label"])
        
        if not all_boxes:
            return []
            
        print(f"Tiled Inference: Merging {len(all_boxes)} candidates...")
        # Global NMS
        if len(all_boxes) > 0:
            boxes_t = torch.tensor(all_boxes, dtype=torch.float32).to(self._device)
            scores_t = torch.tensor(all_scores, dtype=torch.float32).to(self._device)
            
            keep_indices = ops.nms(boxes_t, scores_t, iou_threshold=0.5)
            
            final_results = []
            for idx in keep_indices:
                i = idx.item()
                final_results.append({
                    "bbox": all_boxes[i],
                    "score": all_scores[i],
                    "label": all_labels[i]
                })
            return final_results
            
        return []

    def _predict_smart_focus(self, image: Image.Image, text_prompt: str, box_threshold: float, text_threshold: float, sam_model, sensitivity: float):
        if not sam_model:
            print("Smart Focus: No SAM model provided, falling back to standard.")
            return self._predict_standard(image, text_prompt, box_threshold, text_threshold)
            
        print("Smart Focus: Generating candidate regions with SAM...")
        import numpy as np
        img_np = np.array(image)
        
        # 1. Generate Proposals (Class-agnostic)
        # Using SAM automatic mask generation or generic prompt
        # Assuming sam_model is Ultralytics YOLO-SAM wrapper which supports generic predict
        try:
            # conf acts as sensitivity (lower = more proposals)
            sam_results = sam_model(img_np, verbose=False, conf=sensitivity)
        except Exception as e:
            print(f"Smart Focus: SAM generation failed ({e}), fallback.")
            return self._predict_standard(image, text_prompt, box_threshold, text_threshold)
            
        if not sam_results or not sam_results[0].boxes:
            print("Smart Focus: No candidates found by SAM.")
            return []
            
        # 2. Extract Candidate Boxes
        candidate_boxes = sam_results[0].boxes.xyxy.cpu().numpy().tolist()
        
        # 3. Cluster/Merge Boxes into ROIs
        rois = self._merge_boxes(candidate_boxes, iou_threshold=0.1) # Aggressive merging
        print(f"Smart Focus: Reduced {len(candidate_boxes)} proposals to {len(rois)} ROIs.")
        
        all_results = []
        all_offsets = [] # Track offsets for global NMS logic if needed, or just append
        
        # 4. Run Grounding DINO on ROIs
        for (rx1, ry1, rx2, ry2) in rois:
            # Pad ROI slightly
            padding = 10
            rx1 = max(0, int(rx1) - padding)
            ry1 = max(0, int(ry1) - padding)
            rx2 = min(image.width, int(rx2) + padding)
            ry2 = min(image.height, int(ry2) + padding)
            
            if rx2 <= rx1 or ry2 <= ry1: continue
            
            crop = image.crop((rx1, ry1, rx2, ry2))
            crop_results = self._predict_standard(crop, text_prompt, box_threshold, text_threshold)
            
            for res in crop_results:
                b = res["bbox"]
                gb = [b[0] + rx1, b[1] + ry1, b[2] + rx1, b[3] + ry1]
                res["bbox"] = gb
                all_results.append(res)

        # 5. Global NMS on final results
        # Reduce duplicates from overlapping ROIs
        if not all_results:
            return []
            
        boxes = [r["bbox"] for r in all_results]
        scores = [r["score"] for r in all_results]
        labels = [r["label"] for r in all_results]
        
        boxes_t = torch.tensor(boxes, dtype=torch.float32).to(self._device)
        scores_t = torch.tensor(scores, dtype=torch.float32).to(self._device)
        
        keep = ops.nms(boxes_t, scores_t, 0.5)
        
        final = []
        for idx in keep:
            i = idx.item()
            final.append(all_results[i])
            
        return final

    def _merge_boxes(self, boxes, iou_threshold=0.1):
        """
        Merges intersecting boxes into larger ROIs using a greedy approach.
        """
        if not boxes: return []
        
        # Convert to list of [x1, y1, x2, y2]
        merged_boxes = []
        
        # Sort by area (optional, maybe not needed)
        remaining = [list(map(float, b)) for b in boxes]
        
        while remaining:
            current = remaining.pop(0)
            
            # Try to merge with any intersecting box in the remaining list
            changed = True
            while changed:
                changed = False
                new_remaining = []
                for other in remaining:
                    if self._do_boxes_intersect(current, other):
                        # Merge
                        current = [
                            min(current[0], other[0]),
                            min(current[1], other[1]),
                            max(current[2], other[2]),
                            max(current[3], other[3])
                        ]
                        changed = True
                    else:
                        new_remaining.append(other)
                remaining = new_remaining
            
            merged_boxes.append(current)
            
        return merged_boxes

    def _do_boxes_intersect(self, box1, box2):
        x1_max = max(box1[0], box2[0])
        y1_max = max(box1[1], box2[1])
        x2_min = min(box1[2], box2[2])
        y2_min = min(box1[3], box2[3])
        
        return x2_min > x1_max and y2_min > y1_max

    def _predict_standard(self, image: Image.Image, text_prompt: str, box_threshold: float = 0.35, text_threshold: float = 0.25):
        """Standard full-image inference."""
        if not text_prompt.endswith("."):
            text_prompt += "."

        try:
            inputs = self._processor(images=image, text=text_prompt, return_tensors="pt").to(self._device)
            
            with torch.no_grad():
                outputs = self._model(**inputs)

            # Post-process outputs
            results = self._processor.image_processor.post_process_object_detection(
                outputs,
                threshold=box_threshold,
                target_sizes=[image.size[::-1]]
            )[0]

            final_results = []
            
            boxes = results["boxes"]
            scores = results["scores"]
            
            if len(boxes) > 0:
                # Apply NMS
                keep_indices = ops.nms(boxes, scores, iou_threshold=0.5)
                
                for idx in keep_indices:
                    box = boxes[idx].tolist()
                    score = scores[idx].item()
                    
                    final_results.append({
                        "bbox": [round(b, 2) for b in box],
                        "score": round(score, 2),
                        "label": text_prompt.replace(".", "").strip(),
                        "class_id": 0
                    })

            return final_results


        except torch.cuda.OutOfMemoryError:
            print("CUDA Out of Memory in Grounding DINO")
            torch.cuda.empty_cache()
            raise Exception("GPU Out of Memory. Try lowering image size or batch.")
        except Exception as e:
            print(f"Error during inference: {e}")
            raise e

grounding_dino_service = GroundingDinoService()
