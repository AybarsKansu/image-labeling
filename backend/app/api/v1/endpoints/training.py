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
    model_manager = Depends(get_model_manager),
    dataset_service = Depends(get_dataset_service)
):
    """Starts model training as a background task."""
    global _training_status
    
    if _training_status.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")
    
    # Parse preprocessing params
    p_params = None
    if preprocess_params:
        try:
            p_params = json.loads(preprocess_params)
        except json.JSONDecodeError:
            pass
    
    # SAM training not supported
    if "sam" in base_model.lower():
        raise HTTPException(
            status_code=400,
            detail="SAM is a Foundation Model and cannot be fine-tuned here. Use YOLO for custom objects."
        )
    
    # Start background task
    background_tasks.add_task(
        _train_model_task,
        base_model,
        epochs,
        batch_size,
        p_params,
        model_manager,
        dataset_service
    )
    
    return JSONResponse({"success": True, "message": "Preprocessing & Training started"})


def _train_model_task(
    base_model_name: str,
    epochs: int,
    batch_size: int,
    preprocess_params: dict,
    model_manager: ModelManager,
    dataset_service: DatasetService
):
    """Background task for model training."""
    global _training_status
    settings = get_settings()
    
    _training_status.is_training = True
    _training_status.progress = 0.0
    _training_status.epoch = 0
    _training_status.total_epochs = epochs
    _training_status.message = "Initializing..."
    
    try:
        # Preprocessing
        target_data_dir = settings.DATASET_DIR
        
        if preprocess_params:
            _training_status.message = "Preprocessing..."
            
            success = dataset_service.preprocess_dataset(
                resize_mode=preprocess_params.get('resize_mode', 'none'),
                enable_tiling=preprocess_params.get('enable_tiling', False),
                tile_size=int(preprocess_params.get('tile_size', 640)),
                tile_overlap=float(preprocess_params.get('tile_overlap', 0.2))
            )
            
            if success:
                target_data_dir = settings.processed_dir
            else:
                _training_status.message = "Preprocessing Failed."
                _training_status.is_training = False
                return
        
        # Generate data.yaml
        yaml_content = f"""
path: {target_data_dir.as_posix()}
train: images
val: images
names:
"""
        # Read classes
        classes_file = target_data_dir / "classes.txt"
        if not classes_file.exists():
            classes_file = settings.DATASET_DIR / "classes.txt"
        
        if not classes_file.exists():
            raise Exception("No classes.txt found. Cannot train.")
        
        with open(classes_file, "r") as f:
            classes = [line.strip() for line in f.readlines() if line.strip()]
        
        for i, c in enumerate(classes):
            yaml_content += f"  {i}: {c}\n"
        
        yaml_path = settings.DATASET_DIR / "data.yaml"
        with open(yaml_path, "w") as f:
            f.write(yaml_content)
        
        _training_status.message = "Starting training..."
        
        # Load model
        model = YOLO(base_model_name)
        
        # Custom callback for progress
        def on_train_epoch_end(trainer):
            _training_status.epoch = trainer.epoch + 1
            progress = 0.3 + ((trainer.epoch + 1) / epochs * 0.7)
            _training_status.progress = min(progress, 0.99)
            _training_status.message = f"Epoch {trainer.epoch + 1}/{epochs}"
        
        model.add_callback("on_train_epoch_end", on_train_epoch_end)
        
        # Train
        results = model.train(
            data=yaml_path.as_posix(),
            epochs=epochs,
            batch=batch_size,
            imgsz=640,
            plots=False,
            device='cuda',
            project="runs",
            name="train_job",
            exist_ok=True
        )
        
        _training_status.message = "Finalizing..."
        
        # Post-processing
        best_pt = Path("runs/train_job/weights/best.pt")
        if best_pt.exists():
            new_name = get_next_version_name("custom_v*.pt", Path("."))
            shutil.move(str(best_pt), new_name)
            
            # Reload models
            model_manager.scan_models()
            
            _training_status.message = f"Completed! Saved as {new_name}"
            
            # Cleanup runs folder
            try:
                if os.path.exists("runs"):
                    shutil.rmtree("runs")
                    print("Deleted runs/ folder.")
            except Exception as e:
                print(f"Failed to delete runs/: {e}")
        else:
            _training_status.message = "Failed: best.pt not found."
    
    except Exception as e:
        _training_status.message = f"Error: {e}"
        print(f"Training Error: {e}")
    finally:
        _training_status.is_training = False
