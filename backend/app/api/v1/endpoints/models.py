"""
Model Management API endpoints.
List, download, and delete ML models using the model registry.
"""

from fastapi import APIRouter, Depends, HTTPException, Body

from app.services.model_manager import ModelManager, get_model_manager
from app.schemas.models import (
    ModelsListResponse,
    DownloadModelRequest,
    DownloadModelResponse,
    DeleteModelResponse,
)

router = APIRouter(tags=["models"])


@router.get("/models", response_model=ModelsListResponse)
async def get_available_models(
    model_manager: ModelManager = Depends(get_model_manager)
):
    """
    Returns list of all available models from the registry.
    
    Each model includes:
    - id: Model filename
    - name: Human-readable name
    - type: detection, segmentation, or helper
    - family: yolo or sam
    - url: Download URL
    - description: Model description
    - is_downloaded: Whether model exists locally
    """
    models = model_manager.get_available_models()
    return ModelsListResponse(models=models)


@router.post("/download-model", response_model=DownloadModelResponse)
async def download_model(
    request: DownloadModelRequest = Body(...),
    model_manager: ModelManager = Depends(get_model_manager)
):
    """
    Downloads a model from the registry.
    
    Only models defined in models.yaml can be downloaded.
    Does NOT use Ultralytics auto-download to avoid rate limits.
    """
    # The request body is parsed into DownloadModelRequest
    success, message = model_manager.download_model(request.model_id)
    
    if success:
        # Get updated model info
        models = model_manager.get_available_models()
        # Find the specific model we just downloaded to return its new state (is_downloaded=True)
        model_info = next((m for m in models if m.id == request.model_id), None)
        return DownloadModelResponse(success=True, message=message, model=model_info)
    
    # Determine appropriate status code based on error
    if "not found in registry" in message:
        raise HTTPException(status_code=404, detail=message)
    else:
        raise HTTPException(status_code=500, detail=message)


@router.delete("/delete-model", response_model=DeleteModelResponse)
async def delete_model(
    model_id: str = Body(..., embed=True),
    model_manager: ModelManager = Depends(get_model_manager)
):
    """
    Deletes a local model file.
    
    Only .pt files can be deleted. Path traversal is not allowed.
    """
    success, message = model_manager.delete_model(model_id)
    
    if success:
        return DeleteModelResponse(success=True, message=message)
    
    if "Invalid" in message or "Only" in message:
        raise HTTPException(status_code=400, detail=message)
    else:
        raise HTTPException(status_code=404, detail=message)
