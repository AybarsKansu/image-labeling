"""
Model Manager Service.
Singleton class for managing ML model lifecycle (YOLO/SAM).
Handles loading, caching, lazy initialization, and cleanup.
"""

import os
import glob
from pathlib import Path
from typing import Dict, Optional, Any
from functools import lru_cache

from ultralytics import YOLO

# Conditional SAM import
try:
    from ultralytics import SAM
    SAM_AVAILABLE = True
except ImportError:
    SAM = None
    SAM_AVAILABLE = False
    print("Warning: SAM not available in ultralytics.")


class ModelManager:
    """
    Singleton manager for ML models.
    Handles lazy loading, caching, and GPU memory management.
    """
    
    _instance: Optional["ModelManager"] = None
    _models: Dict[str, Any] = {}
    _device: str = "cuda"
    
    def __new__(cls, device: str = "cuda") -> "ModelManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._models = {}
            cls._instance._device = device
        return cls._instance
    
    def __init__(self, device: str = "cuda"):
        # Only update device if explicitly provided differently
        if device != "cuda" or not hasattr(self, '_initialized'):
            self._device = device
            self._initialized = True
    
    @property
    def device(self) -> str:
        return self._device
    
    @property
    def models(self) -> Dict[str, Any]:
        return self._models
    
    def scan_models(self, search_paths: list[str] = None) -> list[str]:
        """
        Scans for .pt model files and loads them.
        
        Args:
            search_paths: Glob patterns to search (default: current dir)
            
        Returns:
            List of loaded model names
        """
        print("Scanning for models...")
        
        if search_paths is None:
            search_paths = ["*.pt", "**/*.pt"]
        
        # Standard models to look for
        standard_models = [
            "yolov8m-seg.pt", "yolov8x-seg.pt", 
            "sam3_b.pt", "sam3_l.pt", "yolov8l-world.pt",
            "yolo11x-seg.pt", "yolo11l-seg.pt", "yolo11m-seg.pt",
            "sam2.1_l.pt", "sam2.1_b.pt", "sam2.1_t.pt"
        ]
        
        # Discover local files
        local_files = set()
        for pattern in search_paths:
            for filepath in glob.glob(pattern, recursive=True):
                filepath = os.path.normpath(filepath)
                local_files.add(filepath)
        
        print(f"Discovered local files: {list(local_files)}")
        
        # Load discovered files
        for fp in local_files:
            self._load_and_register(fp, fp)
        
        # Load standard models if they exist locally
        for m in standard_models:
            if os.path.exists(m) and m not in self._models:
                self._load_and_register(m, m)
        
        return list(self._models.keys())
    
    def _load_and_register(self, name: str, path: str) -> bool:
        """
        Internal method to load and register a model.
        
        Args:
            name: Logical name for the model
            path: File path to load from
            
        Returns:
            True if successfully loaded
        """
        if name in self._models:
            return True
            
        try:
            print(f"Loading {name}...")
            
            if self._is_sam_model(name) and SAM_AVAILABLE:
                model = SAM(path)
            else:
                model = YOLO(path)
            
            # Move to GPU
            model.to(self._device)
            self._models[name] = model
            print(f"Loaded {name} to {self._device}.")
            return True
            
        except Exception as e:
            print(f"Failed to load {name}: {e}")
            return False
    
    def _is_sam_model(self, name: str) -> bool:
        """Check if model name indicates a SAM model."""
        name_lower = name.lower()
        return "sam" in name_lower and "yolo" not in name_lower
    
    def get_model(self, model_name: str = None) -> Optional[Any]:
        """
        Gets a model by name, lazy-loading if necessary.
        
        Args:
            model_name: Model name/path. None uses default YOLO.
            
        Returns:
            Model instance or None if not found
        """
        if not model_name:
            model_name = "yolov8m-seg.pt"
        
        # 1. Try exact match in cache
        if model_name in self._models:
            return self._models[model_name]
        
        # 2. Try lazy load from disk
        possible_paths = [model_name]
        if not os.path.exists(model_name):
            basename = os.path.basename(model_name)
            if os.path.exists(basename):
                possible_paths.append(basename)
        
        for path in possible_paths:
            if os.path.exists(path):
                print(f"Lazy loading {path}...")
                if self._load_and_register(model_name, path):
                    return self._models.get(model_name)
        
        # 3. Try auto-download for known YOLO models
        if "yolo" in model_name.lower() and "sam" not in model_name.lower():
            try:
                print(f"Attempting auto-download for {model_name}...")
                model = YOLO(model_name)
                model.to(self._device)
                self._models[model_name] = model
                return model
            except Exception as e:
                print(f"Auto-download failed for {model_name}: {e}")
        
        # 4. Fallback to any available YOLO model
        if self._models:
            for k, v in self._models.items():
                if "yolo" in k.lower():
                    print(f"Warning: {model_name} not found. Using fallback {k}.")
                    return v
            
            fallback = list(self._models.values())[0]
            print(f"Warning: {model_name} not found. Using generic fallback.")
            return fallback
        
        return None
    
    def download_model(self, model_name: str) -> tuple[bool, str]:
        """
        Downloads a model from Ultralytics hub.
        
        Args:
            model_name: Model name to download
            
        Returns:
            Tuple of (success, message)
        """
        # Validate model name
        valid_prefixes = ["yolo", "sam"]
        if not any(model_name.lower().startswith(p) for p in valid_prefixes):
            return False, "Invalid model name. Must start with 'yolo' or 'sam'."
        
        print(f"Attempting to download/load: {model_name}")
        
        try:
            if self._is_sam_model(model_name):
                if not SAM_AVAILABLE:
                    return False, "SAM support not available (ultralytics.SAM missing)"
                model = SAM(model_name)
            else:
                model = YOLO(model_name)
            
            model.to(self._device)
            self._models[model_name] = model
            return True, f"Successfully loaded {model_name}"
            
        except Exception as e:
            print(f"Download failed: {e}")
            return False, f"Failed to download/load model: {str(e)}"
    
    def delete_model(self, model_name: str) -> tuple[bool, str]:
        """
        Deletes a local model file.
        
        Args:
            model_name: Model filename to delete
            
        Returns:
            Tuple of (success, message)
        """
        # Safety checks
        if "/" in model_name or "\\" in model_name:
            return False, "Invalid filename"
        
        if not model_name.endswith(".pt"):
            return False, "Only .pt files can be deleted"
        
        if os.path.exists(model_name):
            os.remove(model_name)
            if model_name in self._models:
                del self._models[model_name]
            return True, f"Deleted {model_name}"
        
        return False, "File not found"
    
    def list_models(self) -> list[str]:
        """Returns list of currently loaded model names."""
        return list(self._models.keys())
    
    def is_sam_available(self) -> bool:
        """Check if SAM models can be loaded."""
        return SAM_AVAILABLE
    
    def get_sam_class(self):
        """Get the SAM class for type checking."""
        return SAM


@lru_cache
def get_model_manager():
    """FastAPI dependency for ModelManager singleton."""
    return ModelManager()
