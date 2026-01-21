"""
Pydantic schemas for training endpoints.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


class PreprocessParams(BaseModel):
    """Parameters for dataset preprocessing."""
    resize_mode: Literal["none", "640", "1024"] = "none"
    enable_tiling: bool = False
    tile_size: int = Field(default=640, ge=64, le=2048)
    tile_overlap: float = Field(default=0.2, ge=0, le=0.5)


class TrainModelRequest(BaseModel):
    """Request to start model training."""
    base_model: str = Field(..., description="Base model name/path")
    epochs: int = Field(default=100, ge=1, le=1000)
    batch_size: int = Field(default=16, ge=1, le=128)
    preprocess_params: Optional[PreprocessParams] = None


class TrainingStatus(BaseModel):
    """Current training status."""
    is_training: bool = False
    progress: float = Field(default=0.0, ge=0, le=1)
    message: str = "Idle"
    epoch: int = 0
    total_epochs: int = 0


class TrainingStatusResponse(BaseModel):
    """Response containing training status."""
    is_training: bool
    progress: float
    message: str
    epoch: int
    total_epochs: int
