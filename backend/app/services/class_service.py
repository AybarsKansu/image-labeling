"""
Class Service.
Manage dataset classes (names, IDs, colors).
"""

from pathlib import Path
from typing import List
from functools import lru_cache

from app.core.config import get_settings


class ClassService:
    def __init__(self):
        self._settings = get_settings()
        self._classes_file = self._settings.DATASET_DIR / "classes.txt"

    def get_all_classes(self) -> List[str]:
        """Get list of all class names."""
        if not self._classes_file.exists():
            return []
        
        with open(self._classes_file, "r") as f:
            return [line.strip() for line in f.readlines() if line.strip()]

    def get_all_classes_sorted(self) -> List[str]:
        """Get classes sorted by ID (which is just line order)."""
        # In YOLO format, line 0 is ID 0. So just reading them in order is correct.
        return self.get_all_classes()


@lru_cache
def get_class_service():
    """FastAPI dependency."""
    return ClassService()
