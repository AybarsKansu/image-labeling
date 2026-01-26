import os
import time
import tracemalloc
import torch
import pandas as pd
import logging
from typing import List, Union, Dict, Any
from ultralytics import YOLO

logger = logging.getLogger(__name__)

class BenchmarkManager:
    """
    Manages the benchmarking of YOLO models on a specific 'Gold Standard' test set.
    Evaluates Accuracy, Performance (Latency/Throughput), and Resource Usage.
    """

    def __init__(self, test_set_path: str, warmup_steps: int = 10):
        """
        Initialize the BenchmarkManager.

        Args:
            test_set_path (str): Path to the test dataset (e.g., 'coco128.yaml' or path to data.yaml).
            warmup_steps (int): Number of warm-up inference steps to run before measuring performance.
        """
        self.test_set_path = test_set_path
        self.warmup_steps = warmup_steps
        
        logger.warning(
            "CRITICAL: Ensure that the 'Gold Standard' test set located at '%s' "
            "has NOT been used during the training or validation phase of any model being benchmarked. "
            "Using training data for testing will result in biased and invalid metrics.",
            self.test_set_path
        )

    def run_benchmarks(self, models: List[Union[str, YOLO]]) -> pd.DataFrame:
        """
        Runs benchmarks on a list of models.

        Args:
            models (List[Union[str, YOLO]]): A list of model paths, official model names (e.g., 'yolov8n.pt'), or YOLO objects.

        Returns:
            pd.DataFrame: A comparative benchmark table.
        """
        results = []

        for model_input in models:
            # Load model
            if isinstance(model_input, str):
                model_path_or_name = model_input
                try:
                    # Automatically pulls from Ultralytics if it's a known name like 'yolov8n.pt'
                    model = YOLO(model_path_or_name)
                    if os.path.exists(model_path_or_name):
                         model_name = os.path.basename(model_path_or_name)
                         model_size_mb = os.path.getsize(model_path_or_name) / (1024 * 1024)
                    else:
                         # Likely a pretrained model downloaded to cache or current dir
                         model_name = model_path_or_name
                         # Try to find the file to get size, or estimate/skip
                         if hasattr(model, 'ckpt_path') and model.ckpt_path:
                             model_size_mb = os.path.getsize(model.ckpt_path) / (1024 * 1024)
                         else:
                             model_size_mb = 0 
                except Exception as e:
                    logger.error(f"Failed to load model {model_path_or_name}: {e}")
                    continue
            else:
                model = model_input
                model_name = model.ckpt_path if hasattr(model, 'ckpt_path') else "Custom Model"
                model_size_mb = 0 

            logger.info(f"Benchmarking model: {model_name}")

            # 1. Accuracy Metrics (using val mode)
            try:
                # Task Alignment Fix:
                # If model is segmentation (-seg) but we suspect the dataset is detection-only, 
                # we should handle it. 
                # However, ultralytics 'val' usually handles 'task' argument. 
                # If we pass task='detect' to a segmentation model, it calculates box metrics.
                # We can try to detect this intent or just always default to capturing box metrics 
                # because box metrics exist for both detection and segmentation models.
                
                # Check if model is segmentation
                is_seg = hasattr(model, 'task') and model.task == 'segment'
                val_args = {'data': self.test_set_path, 'split': 'test', 'verbose': False}
                
                # Force detection mode if needed? 
                # Actually, standard val() for seg model computes both box and mask if data supports it.
                # If data is ONLY box, seg model val might fail or return 0 for mask.
                # Use 'box' metrics primarily for comparison if mixed.
                
                metrics_obj = model.val(**val_args)
                
                # Extract metrics
                # Always safely get box metrics first
                map50 = metrics_obj.box.map50
                map50_95 = metrics_obj.box.map
                precision = metrics_obj.box.mp
                recall = metrics_obj.box.mr
                
                # If these are 0 and it's a segmentation model, maybe it tried to evaluate masks and failed?
                # But metrics_obj.box should be populated even for seg models (they output boxes too).
                # If 0, it likely means the class mapping was wrong OR the dataset format didn't match.
                
                f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

            except Exception as e:
                logger.error(f"Error calculating accuracy metrics for {model_name}: {e}")
                map50 = map50_95 = precision = recall = f1_score = 0.0

            # 2. Performance & Resources (Inference Loop)
            # Clean up before performance run to ensure fair start
            torch.cuda.empty_cache()
            import gc
            gc.collect()
            
            latency_ms, throughput_fps, peak_ram_mb, peak_vram_mb = self._measure_performance(model)

            results.append({
                "Model": model_name,
                "mAP@0.5": map50,
                "mAP@0.5-0.95": map50_95,
                "Precision": precision,
                "Recall": recall,
                "F1-Score": f1_score,
                "Latency (ms)": latency_ms,
                "Throughput (FPS)": throughput_fps,
                "File Size (MB)": model_size_mb,
                "Peak RAM (MB)": peak_ram_mb,
                "Peak VRAM (MB)": peak_vram_mb
            })

            # Cleanup between models
            del model
            torch.cuda.empty_cache()
            gc.collect()

        df = pd.DataFrame(results)
        return df

    def _measure_performance(self, model: YOLO):
        """
        internal method to measure latency, FPS, and resource usage.
        """
        # Prepare a dummy input or load a few images from the test set for performance testing
        # For meaningful FPS, we often just need the model to predict on images.
        # We can use the 'predict' method on the dataset source.
        
        # We need a list of images. Since accessing the dataset directly might be complex depending on format,
        # we will assume we can retrieve a few image paths from the dataset yaml or folder.
        # Ideally, we iterate over the dataset loader provided by YOLO, but 'val' already did that.
        # Here we want pure inference speed, typically done with `model.predict`.
        
        # For simplicity and robustness, we will perform a separate pass on the test set (or a subset)
        # using the predictor to measure time.
        
        # Start Resource Monitoring
        tracemalloc.start()
        torch.cuda.reset_peak_memory_stats()
        
        # Warm-up
        # Just predict on a dummy image or the first batch of the dataset
        # Creating a random tensor for warmups is standard for pure model speed, 
        # but for end-to-end pipeline speed (including pre/post process), real images are better.
        # Let's try to run a small prediction.
        
        # Note: We can iterate the dataset using the model's validator data loader if accessible,
        # but 'predict' handles loading too.
        
        start_time = time.time()
        
        # Run inference 
        # stream=True returns a generator, which is good for memory but we want to time the whole process?
        # Typically benchmark is Latency per image.
        
        # We will use 'predict' on the test set path. 
        # Ultralytics 'benchmark' mode exists but user asked for custom implementation.
        
        # To strictly implement "Warm-up steps", we need to run N inferences first.
        # We'll assume the dataset path given is a folder of images or a .yaml.
        # If it's a .yaml, we let YOLO handle data loading, but getting exactly "N warmups" then "M measurements"
        # suggests we should control the loop.
        
        # Simplified approach: Use `model(source=..., stream=True)`
        
        # 1. Warmup
        if self.test_set_path.lower().endswith(('.yaml', '.yml')):
            import yaml
            try:
                with open(self.test_set_path, 'r') as f:
                    data = yaml.safe_load(f)
                    # Try to find 'test' or 'val' or 'path'
                    if 'test' in data:
                        image_source = data['test']
                    elif 'val' in data:
                        image_source = data['val']
                    else:
                        # Fallback might be complex, assume 'path' + 'images'? 
                        # Ultralytics often downloads datasets to specific dirs.
                        # If coco8.yaml, it will be downloaded. 
                        # For now, let's keep it as is if we can't parse easily, 
                        # OR if it's a known name like 'coco8.yaml', pass the name directly?
                        # ACTUALLY: model.predict DOES NOT support yaml. 
                        # We need the direct path to images.
                        # If using standard datasets like coco8, we might simply let YOLO handle it 
                        # by NOT using predict(source=yaml) but predict(source=images_dir).
                        # But verifying where coco8 is unzip is hard dynamically.
                        
                        # Alternative: Use 'val' mode for performance too? 
                        # val() is optimized for metrics, but can report speed.
                        # metrics.speed contains {'preprocess': x, 'inference': y, 'loss': z, 'postprocess': w}
                        # We can use that! 
                        # BUT, 'val' runs usually with batch_size > 1 (defaults 32). 
                        # Latency is usually single image.
                        # So we prefer predict(source=image, batch=1).
                        
                        image_source = None
                        
                    # Resolve relative path
                    if image_source and not os.path.isabs(image_source):
                         # If it's something like "images/val", it is relative to the yaml location 
                         # OR relative to the 'path' entry in yaml.
                         base_path = os.path.dirname(self.test_set_path)
                         if 'path' in data:
                             base_path = data['path']
                         image_source = os.path.join(base_path, image_source)

            except Exception as e:
                logger.warning(f"Failed to parse yaml {self.test_set_path} for images: {e}")
                image_source = self.test_set_path
        else:
            image_source = self.test_set_path
            
        if not image_source:
             logger.warning("Could not determine image source from yaml. Using original path.")
             image_source = self.test_set_path

        # 1. Warmup
        if self.warmup_steps > 0:
            # Use a dummy tensor for fastest warmup of the model weights on GPU
            dummy_input = torch.zeros((1, 3, 640, 640), device=model.device) 
            for _ in range(self.warmup_steps):
                model(dummy_input, verbose=False)
                
        # 2. Measurement
        t0_inference = time.time()
        try:
            # Note: stream=True is critical for iterator
            results = model.predict(source=image_source, verbose=False, stream=True)
            
            count = 0
            for _ in results:
                count += 1
        except Exception as e:
            logger.error(f"Prediction failed on source {image_source}: {e}")
            count = 0
            
        total_time = time.time() - t0_inference
        
        if count == 0:
            return 0, 0, 0, 0
            
        avg_latency = (total_time / count) * 1000 # ms
        throughput = count / total_time
        
        # Resource Stats
        current, peak_ram = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peak_ram_mb = peak_ram / (1024 * 1024)
        
        peak_vram_mb = 0
        if torch.cuda.is_available():
            peak_vram_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
            
        return avg_latency, throughput, peak_ram_mb, peak_vram_mb
