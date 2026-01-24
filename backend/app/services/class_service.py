import json
import os
from pathlib import Path
from typing import List, Dict, Tuple

from app.core.config import get_settings

class ClassService:
    """
    Manages the Master Class Registry (project_classes.json).
    Handles ID generation, persistence, and external data mapping.
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.registry_file = self.settings.DATASET_DIR / "project_classes.json"
        self._ensure_registry()
        
    def _ensure_registry(self):
        """Ensure project_classes.json exists."""
        if not self.registry_file.exists():
            # Init with empty or existing classes.txt if available for migration
            initial_map = {}
            classes_txt = self.settings.DATASET_DIR / "classes.txt"
            if classes_txt.exists():
                with open(classes_txt, "r") as f:
                    names = [l.strip() for l in f.readlines() if l.strip()]
                    for idx, name in enumerate(names):
                        initial_map[name] = idx
            
            with open(self.registry_file, "w") as f:
                json.dump(initial_map, f, indent=2)

    def get_registry(self) -> Dict[str, int]:
        """Return current {name: id} map."""
        try:
            with open(self.registry_file, "r") as f:
                return json.load(f)
        except:
            return {}

    def save_registry(self, registry: Dict[str, int]):
        """Save registry to disk."""
        with open(self.registry_file, "w") as f:
            json.dump(registry, f, indent=2)
            
        # Also sync classes.txt for backward compatibility / viewing
        # Sort by ID
        sorted_classes = sorted(registry.items(), key=lambda item: item[1])
        # We need to fill gaps if any, or just list them. YOLO expects 0..N continuous usually.
        # But if we have huge gaps, data.yaml handling is tricky.
        # Ideally, we assume continuous IDs for simplicity or handle remapping in data.yaml (names list)
        
        # Write classes.txt as strictly the ordered list of names
        # Warning: If IDs are non-continuous (0, 2, 5...), simple line-based classes.txt fails.
        # Strategy: Our Append-Only logic guarantees continuous 0..N if we start from 0 and +1.
        
        classes_txt = self.settings.DATASET_DIR / "classes.txt"
        with open(classes_txt, "w") as f:
            for name, _ in sorted_classes:
                f.write(f"{name}\n")

    def get_or_create_class_id(self, class_name: str) -> int:
        """Get ID for a class, registering it if new."""
        registry = self.get_registry()
        
        if class_name in registry:
            return registry[class_name]
        
        # Create new
        if registry:
            new_id = max(registry.values()) + 1
        else:
            new_id = 0
            
        registry[class_name] = new_id
        self.save_registry(registry)
        return new_id

    def get_id_map_for_external_classes(self, external_classes: List[str]) -> Dict[int, int]:
        """
        Generates a map {external_id: master_id} for a list of external class names.
        Example: external ["car", "truck"] -> {0: 5, 1: 8} if car is 5, truck is 8 in master.
        """
        id_map = {}
        for ext_id, name in enumerate(external_classes):
            master_id = self.get_or_create_class_id(name)
            if ext_id != master_id:
                id_map[ext_id] = master_id
        return id_map

    def get_all_classes_sorted(self) -> List[str]:
        """Returns list of class names sorted by ID [0, 1, 2...]."""
        registry = self.get_registry()
        sorted_pairs = sorted(registry.items(), key=lambda ip: ip[1])
        return [name for name, _ in sorted_pairs]

def get_class_service() -> ClassService:
    return ClassService()
