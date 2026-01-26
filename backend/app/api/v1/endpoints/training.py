"""
Training API endpoints.
Model training and status monitoring.
"""

import json
import shutil
import os
from pathlib import Path
from fastapi import APIRouter, Form, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from ultralytics import YOLO

from app.core.config import get_settings
from app.services.model_manager import ModelManager, get_model_manager
from app.services.dataset_service import DatasetService, get_dataset_service
from app.schemas.training import TrainingStatus, PreprocessParams
from app.utils.file_io import get_next_version_name

router = APIRouter(tags=["training"])

# Global training status (thread-safe access)
_training_status = TrainingStatus()


def get_training_status_obj() -> TrainingStatus:
    """Get the global training status object."""
    return _training_status


@router.get("/training-status")
async def get_training_status():
    """Returns current training status."""
    return JSONResponse(_training_status.model_dump())


@router.post("/train-model")
async def train_model(
    background_tasks: BackgroundTasks,
    base_model: str = Form(...),
    epochs: int = Form(100),
    batch_size: int = Form(16),
    preprocess_params: str = Form(None),
    model_manager: ModelManager = Depends(get_model_manager),
    dataset_service: DatasetService = Depends(get_dataset_service),
    class_service: ClassService = Depends(get_class_service)
):
    """Starts model training as a background task."""
    
    # Check if already training
    status = training_service.get_status()
    if status.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")
    
    # Check for invalid models (SAM, Grounding DINO)
    training_service.validate_model_for_training(base_model)
    
    p_params = None
    if preprocess_params:
        try:
            p_params = json.loads(preprocess_params)
        except json.JSONDecodeError:
            pass
    
    # Start background task via Service
    background_tasks.add_task(
        training_service.run_training_task,
        base_model,
        epochs,
        batch_size,
        p_params,
        model_manager,
        dataset_service
    )
    
    return JSONResponse({"success": True, "message": "Preprocessing & Training started"})
