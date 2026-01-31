"""
Pydantic schemas for model management.
Defines model registry types and API response models.
"""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class ModelType(str, Enum):
    """Type of ML model based on its primary function."""
    DETECTION = "detection"
    SEGMENTATION = "segmentation"
    OBB = "obb"
    POSE = "pose"
    CLASSIFICATION = "classification"
    HELPER = "helper"  # Models like SAM that assist other models


class ModelFamily(str, Enum):
    """Family/architecture of the model."""
    YOLO = "yolo"
    SAM = "sam"

# TODO modellerin type'ı yerine detaylı kullanım rehberi gelebilir.
class ModelInfo(BaseModel):
    """Complete information about a model from the registry."""
    id: str = Field(..., description="Model filename (e.g., 'yolov8n.pt')")
    name: str = Field(..., description="Human-readable display name")
    type: ModelType = Field(..., description="Model type (detection, segmentation, helper)")
    family: ModelFamily = Field(..., description="Model family (yolo, sam)")
    url: str = Field(..., description="Direct download URL for model weights")
    description: str = Field(..., description="Brief description of model capabilities")
    is_downloaded: bool = Field(default=False, description="Whether model exists locally")


class ModelsListResponse(BaseModel):
    """Response from GET /models endpoint."""
    models: List[ModelInfo] = Field(default_factory=list)


class DownloadModelRequest(BaseModel):
    """Request body for POST /download-model endpoint."""
    model_id: str = Field(..., description="Model ID from registry to download")


class DownloadModelResponse(BaseModel):
    """Response from POST /download-model endpoint."""
    success: bool
    message: str
    model: Optional[ModelInfo] = None


class DeleteModelResponse(BaseModel):
    """Response from DELETE /delete-model endpoint."""
    success: bool
    message: Optional[str] = None
