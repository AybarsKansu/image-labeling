import os
import cv2
import json
import torch
import numpy as np
import pandas as pd
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple
from ultralytics import YOLO
from ultralytics.utils.metrics import box_iou
from ultralytics.utils.ops import xywhn2xyxy

logger = logging.getLogger(__name__)

class FailureAnalyzer:
    """
    Analyzes model failure modes on a test set.
    Categorizes errors into False Positives (Ghosts), False Negatives (Misses), and Misclassifications.
    Visualizes the worst performing images.
    """

    def __init__(self, test_set_path: str, output_dir: str = "runs/analysis/failures"):
        """
        Args:
            test_set_path (str): Path to the directory of test images. 
                                 Assumes valid YOLO structure where labels are in a parallel 'labels' directory.
            output_dir (str): Directory to save analysis results and visualizations.
        """
        self.test_set_path = Path(test_set_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Infer labels path
        # Standard YOLO: .../images/test -> .../labels/test
        # Or just .../images -> .../labels
        search_path_str = str(self.test_set_path)
        if "images" in search_path_str:
            self.labels_path = Path(search_path_str.replace("images", "labels"))
        else:
            logger.warning(f"Could not infer labels path from {self.test_set_path}. assuming sibling 'labels' dir.")
            self.labels_path = self.test_set_path.parent / "labels"

    def analyze_model(self, model_path: str, iou_threshold: float = 0.5):
        """
        Performs analysis on a specific model.
        """
        model = YOLO(model_path)
        model_name = Path(model_path).stem
        
        # Results container
        image_stats = []
        confusion_details = [] # Store pairs of (gt_cls, pred_cls) for misclassifications

        # List all images
        valid_extensions = {".jpg", ".jpeg", ".png", ".bmp"}
        image_files = [f for f in self.test_set_path.iterdir() if f.suffix.lower() in valid_extensions]
        
        logger.info(f"Analyzing {len(image_files)} images for model {model_name}...")

        for img_file in image_files:
            # 1. Load Ground Truth
            label_file = self.labels_path / (img_file.stem + ".txt")
            gt_boxes = []
            gt_classes = []
            
            img = cv2.imread(str(img_file))
            h, w = img.shape[:2]

            if label_file.exists():
                with open(label_file, "r") as f:
                    for line in f:
                        parts = line.strip().split()
                        cls = int(parts[0])
                        # YOLO format: cls x_center y_center w h (normalized)
                        coords = [float(x) for x in parts[1:]]
                        # Convert to xyxy for IoU
                        xyxy = self._yolo_to_xyxy(coords, w, h)
                        gt_boxes.append(xyxy)
                        gt_classes.append(cls)
            
            gt_boxes_tensor = torch.tensor(gt_boxes) if gt_boxes else torch.empty((0, 4))
            
            # 2. Run Inference
            results = model.predict(str(img_file), verbose=False, conf=0.25) # Default conf
            result = results[0]
            pred_boxes = result.boxes.xyxy.cpu()
            pred_classes = result.boxes.cls.cpu().int().tolist()
            pred_confs = result.boxes.conf.cpu().tolist()

            # 3. Match and Categorize
            fp_count = 0
            fn_count = 0
            misclass_count = 0
            matched_gt = set()
            matched_pred = set()
            
            # Store visualization data
            vis_data = {
                "gt_boxes": gt_boxes, 
                "gt_classes": gt_classes,
                "pred_boxes": pred_boxes.tolist(),
                "pred_classes": pred_classes,
                "fp_indices": [],
                "fn_indices": [],
                "misclass_indices": [] # List of (pred_idx, gt_idx)
            }

            if len(pred_boxes) > 0 and len(gt_boxes_tensor) > 0:
                # Calculate IoU matrix
                iou_matrix = box_iou(gt_boxes_tensor, pred_boxes)
                
                # Simple greedy matching
                # Matches are (gt_idx, pred_idx)
                matches = []
                if iou_matrix.numel() > 0:
                    # Filter by threshold
                    possible_matches = torch.where(iou_matrix >= iou_threshold)
                    if len(possible_matches[0]) > 0:
                        # Zip and sort by IoU descending
                        pairs = zip(possible_matches[0].tolist(), possible_matches[1].tolist())
                        scored_pairs = [(g, p, iou_matrix[g, p].item()) for g, p in pairs]
                        scored_pairs.sort(key=lambda x: x[2], reverse=True)
                        
                        for g_idx, p_idx, score in scored_pairs:
                            if g_idx not in matched_gt and p_idx not in matched_pred:
                                matched_gt.add(g_idx)
                                matched_pred.add(p_idx)
                                # Check classification
                                if gt_classes[g_idx] == pred_classes[p_idx]:
                                    matches.append((g_idx, p_idx))
                                else:
                                    misclass_count += 1
                                    matched_pred.add(p_idx) # Count as matched prediction (but wrong class)
                                    vis_data["misclass_indices"].append((p_idx, g_idx))
                                    confusion_details.append({"gt": gt_classes[g_idx], "pred": pred_classes[p_idx]})

            # Identify False Positives (Predictions with no GT match)
            for p_idx in range(len(pred_boxes)):
                if p_idx not in matched_pred:
                    fp_count += 1
                    vis_data["fp_indices"].append(p_idx)
            
            # Identify False Negatives (GT with no Prediction match)
            for g_idx in range(len(gt_boxes)):
                if g_idx not in matched_gt:
                    fn_count += 1
                    vis_data["fn_indices"].append(g_idx)

            total_errors = fp_count + fn_count + misclass_count
            
            image_stats.append({
                "image_file": str(img_file),
                "fp": fp_count,
                "fn": fn_count,
                "misclass": misclass_count,
                "total_errors": total_errors,
                "vis_data": vis_data
            })

        # 4. Save Statistics
        stats_df = pd.DataFrame(image_stats)
        csv_path = self.output_dir / f"{model_name}_failure_stats.csv"
        stats_df.to_csv(csv_path, index=False)
        
        # Save confusion details if needed
        if confusion_details:
             conf_df = pd.DataFrame(confusion_details)
             conf_df.to_csv(self.output_dir / f"{model_name}_confusion_log.csv", index=False)
        
        logger.info(f"Saved failure statistics to {csv_path}")

        # 5. Visualize Worst Cases
        self._visualize_worst_cases(model_name, image_stats, n=10)

    def _visualize_worst_cases(self, model_name: str, image_stats: List[Dict], n: int = 10):
        """
        Visualizes the top N images with the most errors.
        """
        # Sort by total errors descending
        sorted_stats = sorted(image_stats, key=lambda x: x["total_errors"], reverse=True)
        top_n = sorted_stats[:n]
        
        debug_dir = self.output_dir / "debug_images" / model_name
        debug_dir.mkdir(parents=True, exist_ok=True)
        
        for item in top_n:
            img_path = item["image_file"]
            vis_data = item["vis_data"]
            
            img = cv2.imread(img_path)
            if img is None:
                continue
                
            # Draw False Negatives (Missed) - Blue
            for g_idx in vis_data["fn_indices"]:
                box = vis_data["gt_boxes"][g_idx] # xyxy
                self._draw_box(img, box, (255, 0, 0), "FN")

            # Draw False Positives (Ghosts) - Red
            for p_idx in vis_data["fp_indices"]:
                box = vis_data["pred_boxes"][p_idx]
                self._draw_box(img, box, (0, 0, 255), "FP")

            # Draw Misclassifications - Orange? (User didn't specify, standard practice)
            # User requirement: "Green for GT, Red for FP, Blue for FN". 
            # Misclassification is technically a specific type of error, often shown as FP+FN or special color.
            # I'll use Yellow/Orange for Misclassification to distinguish.
            for p_idx, g_idx in vis_data["misclass_indices"]:
                 box = vis_data["pred_boxes"][p_idx]
                 self._draw_box(img, box, (0, 255, 255), f"Mis:Pred{vis_data['pred_classes'][p_idx]}-GT{vis_data['gt_classes'][g_idx]}")

            # Draw Matched GT (Correct) - Green (Optional but good for context)
            # User requirement: "Green for GT". 
            # I should draw all GTs as Green unless they are FN? 
            # Usually "Green for GT" implies *Unmatched* GT is FN (Blue), Matched GT is Green.
            # But the prompt says "Green for GT, Red for FP, Blue for FN".
            # I will draw all detected GTs as Green, and Missed GTs as Blue.
            
            # Re-iterate GT to draw correctly detected ones
            all_fn_indices = set(vis_data["fn_indices"])
            for idx, box in enumerate(vis_data["gt_boxes"]):
                 if idx not in all_fn_indices:
                     self._draw_box(img, box, (0, 255, 0), "GT")

            save_path = debug_dir / Path(img_path).name
            cv2.imwrite(str(save_path), img)

    def _draw_box(self, img, box, color, label):
        x1, y1, x2, y2 = map(int, box)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        cv2.putText(img, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    def _yolo_to_xyxy(self, coords, w, h):
        # x_center, y_center, width, height -> x1, y1, x2, y2
        xc, yc, bw, bh = coords
        x1 = (xc - bw / 2) * w
        y1 = (yc - bh / 2) * h
        x2 = (xc + bw / 2) * w
        y2 = (yc + bh / 2) * h
        return [x1, y1, x2, y2]
