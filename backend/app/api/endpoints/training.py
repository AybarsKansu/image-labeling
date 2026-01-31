
import json
import shutil
import os
from pathlib import Path
from fastapi import APIRouter, Form, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.model_manager import ModelManager, get_model_manager
from app.services.dataset_service import DatasetService, get_dataset_service
from app.services.class_service import ClassService, get_class_service
from app.services.training_service import training_service
from app.services.task_service import TaskService
from app.schemas.tasks import TaskResult
from app.core.database import get_db

router = APIRouter(tags=["training"])

@router.get("/training-status")
async def get_training_status():
    """Deprecated. Use /tasks/{id} instead."""
    return {"message": "Use GET /tasks/{task_id} to check progress", "is_training": False}

@router.get("/tasks/{task_id}", response_model=TaskResult)
async def get_task_status(
    task_id: str,
    db: Session = Depends(get_db)
):
    """Checks the status of a specific background task."""
    service = TaskService(db)
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

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
    project_ids: str = Form("[]"),
    model_manager: ModelManager = Depends(get_model_manager),
    dataset_service: DatasetService = Depends(get_dataset_service),
    class_service: ClassService = Depends(get_class_service),
    db: Session = Depends(get_db)
):
    """Starts model training as a persistent background task."""
    
    # 1. Check Model Validity
    training_service.validate_model_for_training(base_model)
    
    # 2. Parse Params
    p_params = None
    if preprocess_params:
        try:
            p_params = json.loads(preprocess_params)
        except json.JSONDecodeError:
            pass
            
    try:
        project_ids_list = json.loads(project_ids)
        if not isinstance(project_ids_list, list):
            project_ids_list = []
    except json.JSONDecodeError:
        project_ids_list = []
        
    # 3. Create Task Record in DB
    task_service = TaskService(db)
    new_task = task_service.create_task(type="training")
    
    # 4. Start Background Job
    background_tasks.add_task(
        training_service.run_training_task,
        task_id=new_task.task_id, # Pass the UUID
        base_model_name=base_model,
        epochs=epochs,
        batch_size=batch_size,
        patience=patience,
        optimizer=optimizer,
        lr0=lr0,
        imgsz=imgsz,
        custom_model_name=custom_model_name,
        preprocess_params=p_params,
        model_manager=model_manager,
        dataset_service=dataset_service,
        class_service=class_service,
        project_ids=project_ids_list
    )
    
    return JSONResponse({
        "success": True, 
        "message": "Training started", 
        "task_id": new_task.task_id
    })
