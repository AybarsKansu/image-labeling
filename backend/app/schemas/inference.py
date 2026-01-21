"""
Pydantic schemas for inference endpoints.
Request/response models with validation.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator
import uuid


class BoundingBox(BaseModel):
    """Bounding box coordinates."""
    x: float = Field(..., description="X coordinate (top-left)")
    y: float = Field(..., description="Y coordinate (top-left)")
    w: float = Field(..., ge=1, description="Width")
    h: float = Field(..., ge=1, description="Height")
    
    @property
    def x1(self) -> float:
        return self.x
    
    @property
    def y1(self) -> float:
        return self.y
    
    @property
    def x2(self) -> float:
        return self.x + self.w
    
    @property
    def y2(self) -> float:
        return self.y + self.h
    
    @property
    def xyxy(self) -> tuple[float, float, float, float]:
        """Returns (x1, y1, x2, y2) format."""
        return (self.x1, self.y1, self.x2, self.y2)
    
    @classmethod
    def from_list(cls, coords: list) -> "BoundingBox":
        """Create from [x, y, w, h] list."""
        if len(coords) != 4:
            raise ValueError("Box must have exactly 4 coordinates")
        return cls(x=coords[0], y=coords[1], w=coords[2], h=coords[3])


class Detection(BaseModel):
    """Single detection result."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    points: List[float] = Field(..., description="Flat polygon points [x1,y1,x2,y2,...]")
    type: Literal["poly", "box"] = "poly"
    confidence: Optional[float] = None


class Suggestion(BaseModel):
    """Label suggestion from detection."""
    label: str
    score: float


class DetectAllResponse(BaseModel):
    """Response from detect-all endpoint."""
    detections: List[Detection] = []


class SegmentBoxResponse(BaseModel):
    """Response from segment-box endpoint."""
    detections: List[Detection] = []
    suggestions: List[Suggestion] = []


class RefinePolygonResponse(BaseModel):
    """Response from refine-polygon endpoint."""
    points: List[float]
    label: str = "refined"


class SegmentByTextResponse(BaseModel):
    """Response from segment-by-text endpoint."""
    detections: List[Detection] = []


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: Optional[str] = None
