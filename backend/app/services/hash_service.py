import json
import hashlib
import os
from pathlib import Path
from typing import Dict, Any, Optional

from app.core.config import get_settings

class HashService:
    """
    Manages the registry of file hashes to prevent duplicates.
    Stores data in dataset/.hashes.json
    Format: { "md5_hash": "filename" }
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.hashes_file = self.settings.DATASET_DIR / ".hashes.json"
        self._ensure_file()
        
    def _ensure_file(self):
        """Ensure .hashes.json exists."""
        if not self.hashes_file.exists():
            with open(self.hashes_file, "w") as f:
                json.dump({}, f)

    def calculate_md5(self, file_bytes: bytes) -> str:
        """Calculate MD5 hash of bytes."""
        return hashlib.md5(file_bytes).hexdigest()

    def load_hashes(self) -> Dict[str, str]:
        """Load current hash registry."""
        try:
            with open(self.hashes_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def is_duplicate(self, file_hash: str) -> Optional[str]:
        """
        Check if hash exists. 
        Returns filename if duplicate, None otherwise.
        """
        hashes = self.load_hashes()
        return hashes.get(file_hash)

    def register_file(self, file_hash: str, filename: str):
        """Register a new file hash."""
        hashes = self.load_hashes()
        hashes[file_hash] = filename
        
        with open(self.hashes_file, "w") as f:
            json.dump(hashes, f, indent=2)

def get_hash_service() -> HashService:
    return HashService()
