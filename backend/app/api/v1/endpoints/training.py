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
from app.services.class_service import ClassService, get_class_service
from app.services.training_service import training_service
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
    patience: int = Form(50),
    optimizer: str = Form("auto"),
    lr0: float = Form(0.01),
    imgsz: int = Form(640),
    custom_model_name: str = Form("custom_model.pt"),
    preprocess_params: str = Form(None),
    project_ids: str = Form("[]"),  # JSON array of project IDs
    model_manager: ModelManager = Depends(get_model_manager),
    dataset_service: DatasetService = Depends(get_dataset_service),
    class_service: ClassService = Depends(get_class_service)
):
    """Starts model training as a background task."""
    
    # Check if already training
    status = training_service.get_status()
    if status.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")
    
    # Check for invalid models
    training_service.validate_model_for_training(base_model)
    
    p_params = None
    if preprocess_params:
        try:
            p_params = json.loads(preprocess_params)
        except json.JSONDecodeError:
            pass
    
    # Parse project_ids from JSON
    try:
        project_ids_list = json.loads(project_ids)
        if not isinstance(project_ids_list, list):
            project_ids_list = []
    except json.JSONDecodeError:
        project_ids_list = []
    
    # Start background task with ALL required parameters in correct order
    background_tasks.add_task(
        training_service.run_training_task,
        base_model,
        epochs,
        batch_size,
        patience,
        optimizer,
        lr0,
        imgsz,
        custom_model_name,
        p_params,
        model_manager,
        dataset_service,
        class_service,
        project_ids_list  # Pass as list instead of single ID
    )
    
    return JSONResponse({"success": True, "message": "Preprocessing & Training started"})
