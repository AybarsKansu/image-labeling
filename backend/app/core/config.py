"""
Application configuration using Pydantic Settings.
Loads values from environment variables with sensible defaults.
"""

from pathlib import Path
from typing import Optional
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Base paths
    BASE_DIR: Path = Field(default_factory=lambda: Path(__file__).resolve().parent.parent.parent)
    DATASET_DIR: Optional[Path] = Field(default=None)
    
    # Model settings
    DEFAULT_YOLO_MODEL: str = "yolo26x-seg.pt"
    DEFAULT_SAM_MODEL: str = "sam2.1_l.pt"
    DEFAULT_YOLO_WORLD_MODEL: str = "yolo26x-objv1-150.pt"
    
    # Inference settings
    TILE_SIZE: int = 640
    TILE_OVERLAP: float = 0.25
    DEFAULT_CONFIDENCE: float = 0.5
    DEFAULT_IOU_THRESHOLD: float = 0.5
    
    # Device
    DEVICE: str = "cuda"
    
    # CORS
    CORS_ORIGINS: list[str] = ["*"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def model_post_init(self, __context) -> None:
        """Set derived paths after initialization."""
        if self.DATASET_DIR is None:
            self.DATASET_DIR = self.BASE_DIR / "dataset"

    @property
    def images_dir(self) -> Path:
        return self.DATASET_DIR / "images"
    
    @property
    def labels_dir(self) -> Path:
        return self.DATASET_DIR / "labels"
    
    @property
    def processed_dir(self) -> Path:
        return self.DATASET_DIR / "processed"
    
    @property
    def processed_images_dir(self) -> Path:
        return self.processed_dir / "images"
    
    @property
    def processed_labels_dir(self) -> Path:
        return self.processed_dir / "labels"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
