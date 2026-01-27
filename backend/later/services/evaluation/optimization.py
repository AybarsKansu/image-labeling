import os
import logging
import pandas as pd
from typing import List, Optional
from ultralytics import YOLO
from .benchmark import BenchmarkManager

logger = logging.getLogger(__name__)

class ModelOptimizer:
    """
    Handles model export (ONNX, TensorRT) and format comparison.
    """

    def __init__(self, benchmark_manager: BenchmarkManager):
        """
        Args:
            benchmark_manager (BenchmarkManager): Instance used to evaluate the exported models.
        """
        self.benchmark_manager = benchmark_manager

    def export_model(self, model_path: str, format: str = 'onnx', int8: bool = False, half: bool = False) -> str:
        """
        Exports a .pt model to the specified format.

        Args:
            model_path (str): Path to the .pt model.
            format (str): 'onnx' or 'engine' (TensorRT).
            int8 (bool): Enable INT8 quantization (TensorRT only).
            half (bool): Enable FP16 quantization.

        Returns:
            str: Path to the exported model.
        """
        model = YOLO(model_path)
        logger.info(f"Exporting {model_path} to {format} (INT8={int8}, FP16={half})...")
        
        try:
            # Ultralytics export
            # Returns the filename of the exported model
            exported_path = model.export(format=format, int8=int8, half=half, verbose=False)
            logger.info(f"Export successful: {exported_path}")
            return exported_path
        except Exception as e:
            logger.error(f"Export failed for {model_path}: {e}")
            raise e

    def compare_formats(self, original_model_path: str, formats: List[str] = ['onnx']) -> pd.DataFrame:
        """
        Exports the original model to specified formats and compares them.

        Args:
            original_model_path (str): Path to .pt model.
            formats (List[str]): List of formats to export to (e.g., ['onnx', 'engine']).
        
        Returns:
             pd.DataFrame: Comparison table.
        """
        models_to_test = [original_model_path]
        
        # Export loop
        for fmt in formats:
             # Auto-handle TRT specific flags if needed, or just let defaults apply
             # User requested "include arguments for FP16 and INT8".
             # For simpler comparison, we'll do default export here, or maybe ONE variant.
             # We'll stick to default arguments for comparison unless specified.
             # If fmt is 'engine' (TensorRT), we often want FP16 for sure on GPU.
             half = True if fmt == 'engine' else False
             
             try:
                 exported = self.export_model(original_model_path, format=fmt, half=half)
                 models_to_test.append(exported)
             except Exception:
                 continue

        # Benchmark
        logger.info("Running comparison benchmarks...")
        df = self.benchmark_manager.run_benchmarks(models_to_test)
        
        # Calculate Deltas relative to PyTorch (first row)
        if not df.empty:
            baseline = df.iloc[0]
            base_map = baseline.get("mAP@0.5-0.95", 0)
            base_lat = baseline.get("Latency (ms)", 0)
            
            logger.info("\n--- Format vs. Format Trade-off Analysis ---")
            for idx, row in df.iterrows():
                name = row["Model"]
                curr_map = row.get("mAP@0.5-0.95", 0)
                curr_lat = row.get("Latency (ms)", 0)
                
                # Avoid division by zero
                speed_gain = ((base_lat - curr_lat) / base_lat * 100) if base_lat > 0 else 0
                acc_drop = ((base_map - curr_map) / base_map * 100) if base_map > 0 else 0
                
                # Log summary (Pareto-style intuition)
                logger.info(f"Model: {name}")
                logger.info(f"  > Latency: {curr_lat:.2f}ms (Speed Gain: {speed_gain:+.1f}%)")
                logger.info(f"  > Accuracy: {curr_map:.4f} mAP (Drop: {acc_drop:+.1f}%)")
                if speed_gain > 0 and acc_drop < 1.0:
                     logger.info("  => STAR PICK: High speed gain with minimal accuracy loss!")
                     
        return df
