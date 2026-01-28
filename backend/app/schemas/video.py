from typing import Optional
from pydantic import BaseModel

class VideoUploadInit(BaseModel):
    filename: str
    total_size: int

class VideoUploadInitResponse(BaseModel):
    upload_id: str
    chunk_size: int = 1024 * 1024

class VideoUploadFinalize(BaseModel):
    upload_id: str
    filename: str  # Added filename to finalizing request

class VideoInfo(BaseModel):
    filename: str
    width: int
    height: int
    fps: float
    duration: float
    frame_count: int
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None

class VideoUploadResponse(BaseModel):
    success: bool
    message: str
    video_info: Optional[VideoInfo] = None
