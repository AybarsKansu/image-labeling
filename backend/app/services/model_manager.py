"""
Model Manager Service.
Singleton class for managing ML model lifecycle (YOLO/SAM).
Handles loading, caching, lazy initialization, downloads, and cleanup.
Uses models.yaml as the source of truth for available models.
"""

"""
Bir modelin olabileceği 4 durum var:
models.yaml'da yazılı ama indirilmemiş --> _registerde mevcut fakat dosyası yok ve _model içinde değil. download edilmesi lazım
indirili ama ramde değil --> modelin fiziksel dosyası mevcut fakat gpu'ya yüklenmemiş. birisinin get_model() demesi lazım.
aktif durum --> ekran kartına yüklenmiş kullanıma hazır. yani _models içinde var.
custom models --> models.yaml'da yok ama fiziksel olarak dosyası var. 

self._registry: Hangi modellerin var olabileceğini bilir.
self._models: Hangi modellerin şu an ekran kartında/işlemcide olduğunu bilir.
Path.exists(): Modelin kalıcı olup olmadığını kontrol eder.
is_downloaded: ModelInfo şeması üzerinden frontend'e modelin statüsünü raporlayan bayraktır (flag).
"""

import os
import glob
import yaml
import httpx
from pathlib import Path
from typing import Dict, Optional, Any, List
from functools import lru_cache

from ultralytics import YOLO

from app.schemas.models import ModelInfo, ModelType, ModelFamily

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
    Handles lazy loading, caching, registry-based downloads, and GPU memory management.
    """
    
    _instance: Optional["ModelManager"] = None
    _models: Dict[str, Any] = {}
    _discovered_models: Dict[str, str] = {}  # name -> filepath (for lazy loading)
    _registry: Dict[str, dict] = {}  # Model registry from YAML
    _device: str = "cuda"
    _models_dir: Path = None
    
    def __new__(cls, device: str = "cuda") -> "ModelManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._models = {}
            cls._instance._discovered_models = {}
            cls._instance._registry = {}
            cls._instance._device = device
            cls._instance._load_registry()
        return cls._instance
    
    def __init__(self, device: str = "cuda"):
        # Only update device if explicitly provided differently
        if device != "cuda" or not hasattr(self, '_initialized'):
            self._device = device
            self._initialized = True
    
    def _load_registry(self) -> None:
        """Load model registry from models.yaml."""
        # Determine paths
        core_dir = Path(__file__).resolve().parent.parent / "core"
        registry_path = core_dir / "models.yaml"
        
        # Set models directory to 'backend/models'
        self._models_dir = Path(__file__).resolve().parent.parent.parent / "models"
        self._models_dir.mkdir(exist_ok=True)
        
        # if models.yaml not found:
        if not registry_path.exists():
            print(f"Warning: Model registry not found at {registry_path}")
            return
        
        try:
            with open(registry_path, 'r') as f:
                data = yaml.safe_load(f)
            
            # Flatten registry: family -> list of models becomes id -> model_data
            for family, models in data.items():
                for model in models:
                    model_id = model['id']
                    self._registry[model_id] = {
                        **model,
                        'family': family
                    }
            
            print(f"Loaded {len(self._registry)} models from registry.")
            
        except Exception as e:
            print(f"Error loading model registry: {e}")

    @property
    def device(self) -> str:
        return self._device
    
    @property
    def models(self) -> Dict[str, Any]:
        return self._models
    
    @property
    def models_dir(self) -> Path:
        return self._models_dir
    
    # custom trained ve hazır modelleri döner
    def get_available_models(self) -> List[ModelInfo]:
        """
        Returns list of all models from registry with download status.
        Merges YAML config with local file status.
        Also includes locally discovered (user-trained) models.
        
        Returns:
            List of ModelInfo objects with is_downloaded status
        """
        result = []
        registry_ids = set()
        
        # 1. Models from Registry (YAML)
        for model_id, data in self._registry.items():
            registry_ids.add(model_id)
            # Check if model file exists locally
            model_path = self._models_dir / model_id
            is_downloaded = model_path.exists()
            
            model_info = ModelInfo(
                id=model_id,
                name=data['name'],
                type=ModelType(data['type']),
                family=ModelFamily(data['family']),
                url=data['url'],
                description=data['description'],
                is_downloaded=is_downloaded
            )
            result.append(model_info)
        
        # 2. Add Discovered Models (Not in Registry)
        # Look at both loaded models AND discovered-but-not-loaded models
        all_discovered = set(self._models.keys()) | set(self._discovered_models.keys())
        
        for model_id in all_discovered:
            if model_id not in registry_ids:
                # This is a discovered model (e.g. user-trained)
                # Need to determine type/family best-effort
                model_type = ModelType.DETECTION
                if "seg" in model_id.lower():
                    model_type = ModelType.SEGMENTATION
                
                model_family = ModelFamily.YOLO
                if "sam" in model_id.lower():
                    model_family = ModelFamily.SAM

                model_info = ModelInfo(
                    id=model_id,
                    name=f"Custom: {model_id}",
                    type=model_type,
                    family=model_family,
                    url="", # No URL for local models
                    description="User-trained or locally added model",
                    is_downloaded=True
                )
                result.append(model_info)
        
        return result
    
    # dışarıdan yüklenilen veya custom train edilen modelleri bulmak için
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
             # Default: standard models dir AND all project models
            search_paths = [
                str(self._models_dir / "*.pt"),
                # Search recursively in valid project model dirs
                str(self._models_dir.parent / "storage" / "projects" / "*" / "models" / "*.pt")
            ]
        
        # Discover local files
        local_files = set()
        for pattern in search_paths:
            for filepath in glob.glob(pattern, recursive=True):
                filepath = os.path.normpath(filepath)
                local_files.add(filepath)
        
        print(f"Discovered local files: {list(local_files)}")
        
        # Register discovered files WITHOUT loading them
        for fp in local_files:
            name = os.path.basename(fp)
            self._register_only(name, fp)
        
        return list(self._discovered_models.keys())
    
    def _register_only(self, name: str, path: str):
        """Register a model path for lazy loading later."""
        if name not in self._registry:
            self._discovered_models[name] = path
    
    # bulunan model _models'te yok ise onu models'e ekler.
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
    
    # belirtilen modeli bulmaya çalışır. Bulamazsa fallback mekanizması çalışır. O da olmazsa boş döner
    def get_model(self, model_name: str = None) -> Optional[Any]:
        """
        Gets a model by name, lazy-loading if necessary.
        
        Args:
            model_name: Model name/path. None uses default YOLO.
            
        Returns:
            Model instance or None if not found
        """
        if not model_name:
            model_name = "yolo26x-seg.pt"
        
        # 1. Try exact match in cache
        if model_name in self._models:
            return self._models[model_name]
        
        # 2. Try lazy load from disk
        # Check standard models dir
        model_path = self._models_dir / model_name
        if model_path.exists():
            print(f"Lazy loading {model_name} from models dir...")
            if self._load_and_register(model_name, str(model_path)):
                return self._models.get(model_name)
        
        # Check discovered models path
        if model_name in self._discovered_models:
             path = self._discovered_models[model_name]
             print(f"Lazy loading discovered model {model_name}...")
             if self._load_and_register(model_name, path):
                 return self._models.get(model_name)
        
        # 3. Fallback to any available YOLO model
        if self._models:
            for k, v in self._models.items():
                if "yolo" in k.lower():
                    print(f"Warning: {model_name} not found. Using fallback {k}.")
                    return v
            
            fallback = list(self._models.values())[0]
            print(f"Warning: {model_name} not found. Using generic fallback.")
            return fallback
        
        return None
    
    def download_model(self, model_id: str) -> tuple[bool, str]:
        """
        Downloads a model from the registry URL.
        
        IMPORTANT: Does NOT use Ultralytics auto-download.
        Only downloads models defined in models.yaml.
        
        Args:
            model_id: Model ID from registry (e.g., 'yolov8n.pt')
            
        Returns:
            Tuple of (success, message)
        """
        # Validate model exists in registry
        if model_id not in self._registry:
            available = list(self._registry.keys())
            return False, f"Model '{model_id}' not found in registry. Available: {available}"
        
        model_data = self._registry[model_id]
        url = model_data['url']
        dest_path = self._models_dir / model_id
        
        # Check if already downloaded
        if dest_path.exists():
            # Load it if not already loaded
            if model_id not in self._models:
                self._load_and_register(model_id, str(dest_path))
            return True, f"Model '{model_id}' already exists."
        
        print(f"Downloading {model_id} from {url}...")
        
        try:
            success = self._download_file(url, dest_path)
            if success:
                # Load the newly downloaded model
                self._load_and_register(model_id, str(dest_path))
                return True, f"Successfully downloaded {model_id}"
            else:
                return False, f"Failed to download {model_id}"
                
        except Exception as e:
            print(f"Download failed: {e}")
            return False, f"Failed to download model: {str(e)}"
    

    # rami şişirmeden chunklar halinde indirir.
    def _download_file(self, url: str, dest: Path) -> bool:
        """
        Download a file from URL to destination path.
        
        Args:
            url: Source URL
            dest: Destination file path
            
        Returns:
            True if successful
        """
        try:
            # standart httpx.get yerine rami şişirmeden. stream sunucuya kapı açar. timeout dosya inme süresini belirler. 
            with httpx.stream("GET", url, follow_redirects=True, timeout=300) as response:
                response.raise_for_status()
                
                # toplam kaç byte bilgisini alır
                total = int(response.headers.get("content-length", 0))
                downloaded = 0
                
                with open(dest, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192 * 2 * 2 * 2):
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        if total > 0:
                            pct = (downloaded / total) * 100
                            print(f"\rDownloading: {pct:.1f}%", end="", flush=True)
                
                print()  # Newline after progress
                return True
                
        except Exception as e:
            print(f"Download error: {e}")
            # Clean up partial download
            if dest.exists():
                dest.unlink()
            return False
    
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
        
        model_path = self._models_dir / model_name
        
        if model_path.exists():
            model_path.unlink()
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
    
    def get_registry(self) -> Dict[str, dict]:
        """Returns the model registry dictionary."""
        return self._registry


# birden fazla çağrıya tek instance üzerinden cevap vermeyi sağlar.
@lru_cache
def get_model_manager():
    """FastAPI dependency for ModelManager singleton."""
    return ModelManager()
