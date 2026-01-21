"""
Model Management API endpoints.
List, download, and delete ML models.
"""

from fastapi import APIRouter, Form, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.services.model_manager import ModelManager, get_model_manager

router = APIRouter(tags=["models"])


@router.get("/models")
async def get_available_models(
    model_manager = Depends(get_model_manager)
):
    """Returns list of available loaded models."""
    return JSONResponse({"models": model_manager.list_models()})


@router.post("/download-model")
async def download_model(
    model_name: str = Form(...),
    model_manager = Depends(get_model_manager)
):
    """Downloads a standard model from Ultralytics hub."""
    success, message = model_manager.download_model(model_name)
    
    if success:
        return JSONResponse({"success": True, "message": message})
    
    # Determine appropriate status code
    if "Invalid model name" in message:
        raise HTTPException(status_code=400, detail=message)
    elif "not available" in message:
        raise HTTPException(status_code=500, detail=message)
    else:
        raise HTTPException(status_code=404, detail=message)


@router.delete("/delete-model")
async def delete_model(
    model_name: str = Form(...),
    model_manager = Depends(get_model_manager)
):
    """Deletes a local model file."""
    success, message = model_manager.delete_model(model_name)
    
    if success:
        return JSONResponse({"success": True})
    
    if "Invalid" in message or "Only" in message:
        raise HTTPException(status_code=400, detail=message)
    else:
        raise HTTPException(status_code=404, detail=message)
