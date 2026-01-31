from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.services.video_service import VideoService, get_video_service
from app.schemas.video import (
    VideoUploadInit, VideoUploadInitResponse, 
    VideoUploadFinalize, VideoUploadResponse
)

router = APIRouter(prefix="/videos", tags=["Videos"])

@router.post("/init", response_model=VideoUploadInitResponse)
def init_upload(
    data: VideoUploadInit,
    service: VideoService = Depends(get_video_service)
):
    """
    Start a new video upload session.
    Returns an upload_id to be used for chunk uploads.
    """
    upload_id = service.init_upload(data.filename, data.total_size)
    return VideoUploadInitResponse(
        upload_id=upload_id, 
        chunk_size=1024*1024 # 1MB chunks recommended
    )

@router.post("/upload/{upload_id}")
async def upload_chunk(
    upload_id: str,
    file: UploadFile = File(...),
    service: VideoService = Depends(get_video_service)
):
    """
    Upload a binary chunk for the video.
    Append mode is used.
    """
    chunk = await file.read()
    if not chunk:
        raise HTTPException(status_code=400, detail="Empty chunk received")
    
    await service.save_chunk(upload_id, chunk)
    return {"success": True, "message": "Chunk received"}

@router.post("/finalize", response_model=VideoUploadResponse)
def finalize_upload(
    data: VideoUploadFinalize,
    service: VideoService = Depends(get_video_service)
):
    """
    Finish upload, merge file, and return metadata.
    """
    try:
        video_info = service.finalize_upload(data.upload_id, data.filename)
        return VideoUploadResponse(
            success=True,
            message="Video upload complete",
            video_info=video_info
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
