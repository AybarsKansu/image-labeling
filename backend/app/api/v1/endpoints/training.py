"""
Training API endpoints.
Model training and status monitoring.
"""

import json
import shutil
import os
import glob
from pathlib import Path
from fastapi import APIRouter, Form, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from ultralytics import YOLO

from app.core.config import get_settings
from app.services.model_manager import ModelManager, get_model_manager
from app.services.dataset_service import DatasetService, get_dataset_service
from app.services.class_service import ClassService, get_class_service
from app.schemas.training import TrainingStatus

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
    custom_model_name: str = Form(None),
    preprocess_params: str = Form(None),
    model_manager = Depends(get_model_manager),
    dataset_service = Depends(get_dataset_service),
    class_service = Depends(get_class_service)
):
    """Starts model training as a background task."""
    global _training_status
    
    if _training_status.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")
    
    p_params = None
    if preprocess_params:
        try:
            p_params = json.loads(preprocess_params)
        except json.JSONDecodeError:
            pass
    
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
        patience,
        optimizer,
        lr0,
        imgsz,
        custom_model_name,
        p_params,
        model_manager,
        dataset_service,
        class_service
    )
    
    return JSONResponse({"success": True, "message": "Preprocessing & Training started"})

@router.post("/cancel-training")
async def cancel_training():
    """Cancels the running training task."""
    global _training_status
    if not _training_status.is_training:
        return JSONResponse({"success": False, "message": "No training in progress."})
    
    _training_status.stop_requested = True
    _training_status.message = "Stopping training..."
    return JSONResponse({"success": True, "message": "Cancellation requested."})


def _train_model_task(
    base_model_name: str,
    epochs: int,
    batch_size: int,
    patience: int,
    optimizer: str,
    lr0: float,
    imgsz: int,
    custom_model_name: str,
    preprocess_params: dict,
    model_manager: ModelManager,
    dataset_service: DatasetService,
    class_service: ClassService
):
    """Background task for model training with advanced options."""
    global _training_status
    settings = get_settings()
    
    _training_status.is_training = True
    _training_status.stop_requested = False
    _training_status.progress = 0.0
    _training_status.epoch = 0
    _training_status.total_epochs = epochs
    _training_status.message = "Initializing..."
    
    try:
        # 1. Preprocessing (Includes Split & Remap)
        target_data_dir = settings.DATASET_DIR
        
        # Always run preprocessing if params exist
        # If no params but we want basic split/remap, we might force defaults?
        # User usually sets params via UI. If empty, we might skip or do basic.
        # Let's assume params are passed for advanced mode, or create default dict if None
        if preprocess_params is None:
            preprocess_params = {}
            
        if _training_status.stop_requested: raise InterruptedError("Training cancelled")

        _training_status.message = "Preprocessing..."
        success = dataset_service.preprocess_dataset(
            resize_mode=preprocess_params.get('resize_mode', 'none'),
            enable_tiling=preprocess_params.get('enable_tiling', False),
            tile_size=int(preprocess_params.get('tile_size', 640)),
            tile_overlap=float(preprocess_params.get('tile_overlap', 0.2))
        )
        
        if success:
            target_data_dir = settings.processed_dir # Use 'dataset/processed'
        else:
            # Fallback or Error? 
            # If preprocess fails, we can't guarantee split/remap.
            pass

        # 2. Prepare Data YAML
        # Use ClassService/Master Registry for names
        classes = class_service.get_all_classes_sorted()
        
        # Use generated split files
        train_txt = settings.DATASET_DIR / "autosplit_train.txt"
        val_txt = settings.DATASET_DIR / "autosplit_val.txt"
        
        # Verify exists
        if not train_txt.exists() or not val_txt.exists():
            # If preprocessing didn't create them (e.g. error/skip), fallback to folder
            # But preprocessing SHOULD create them.
            train_path_str = (target_data_dir / "images").as_posix()
            val_path_str = (target_data_dir / "images").as_posix()
        else:
            train_path_str = train_txt.as_posix()
            val_path_str = val_txt.as_posix()

        yaml_content = f"""
path: {settings.DATASET_DIR.as_posix()}
train: {train_path_str}
val: {val_path_str}
names:
"""
        for i, c in enumerate(classes):
            yaml_content += f"  {i}: {c}\n"
        
        yaml_path = settings.DATASET_DIR / "data.yaml"
        with open(yaml_path, "w", encoding="utf-8") as f:
            f.write(yaml_content)

        # 3. Model Training
        _training_status.message = "Starting training..."
        
        # 3. Model Training
        _training_status.message = "Starting training..."
        
        # Resolve Base Model Path to prevent auto-download if possible
        # 1. Check if full path provided or exists in CWD
        model_path = base_model_name
        
        # 2. Check 'models' subdirectory
        if not os.path.exists(model_path):
            candidates = [
                Path("models") / base_model_name,
                Path("backend/models") / base_model_name,
                Path("../models") / base_model_name  # If running from app/ 
            ]
            for cand in candidates:
                if cand.exists():
                    model_path = str(cand)
                    break
        
        # 3. If NOT found, and it's a YOLO model, allow download OR raise error?
        # User requested: "Don't download if not found locally, fail instead" (implied)
        # But for n/s/m models auto-download is nice. For X models it hurts.
        # Let's clean up the path for the print
        print(f"Loading Base Model to start training: {model_path}")
        
        # If model_path still doesn't exist locally, YOLO class will try download.
        # We can trust YOLO to handle small models, but we successfully pointed to local big models now.
        
        model = YOLO(model_path)
        
        def on_train_epoch_end(trainer):
            if _training_status.stop_requested:
                raise InterruptedError("Training cancelled by user")
            _training_status.epoch = trainer.epoch + 1
            progress = 0.3 + ((trainer.epoch + 1) / epochs * 0.7)
            _training_status.progress = min(progress, 0.99)
            _training_status.message = f"Epoch {trainer.epoch + 1}/{epochs}"
        
        model.add_callback("on_train_epoch_end", on_train_epoch_end)
        
        # Train with advanced params
        model.train(
            data=yaml_path.as_posix(),
            epochs=epochs,
            batch=batch_size,
            patience=patience,
            optimizer=optimizer,
            lr0=lr0,
            imgsz=imgsz,
            plots=False,
            device='cuda',
            project="runs",
            name="train_job",
            exist_ok=True
        )
        
        _training_status.message = "Finalizing..."
        
        # 4. Save model
        best_pt = Path("runs/train_job/weights/best.pt")
        if best_pt.exists():
            # Define target directory
            models_dir = Path("models")
            models_dir.mkdir(exist_ok=True) # Ensure it exists
            
            # Name logic
            target_name = custom_model_name.strip() if (custom_model_name and custom_model_name.strip()) else "custom_model.pt"
            
            # Get unique name inside models/
            final_path = _get_unique_model_path(models_dir, target_name)
                
            shutil.move(str(best_pt), str(final_path))
            
            # Reload
            model_manager.scan_models()
            _training_status.message = f"Completed! Saved as {final_path.name}"
            
            # Cleanup
            # try:
            #     if os.path.exists("runs"):
            #         shutil.rmtree("runs")
            # except:
            #     pass
        else:
            _training_status.message = "Failed: best.pt not found."
            
    except InterruptedError:
        _training_status.message = "Training Cancelled."
    except Exception as e:
        _training_status.message = f"Error: {e}"
        print(f"Training Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        _training_status.is_training = False
        _training_status.stop_requested = False

def _get_unique_model_path(directory: Path, desired_name: str) -> Path:
    """Ensures model name is unique in the given directory (e.g. models/drone.pt -> models/drone_1.pt)."""
    if not desired_name.endswith(".pt"):
        desired_name += ".pt"
    
    candidate = directory / desired_name
    if not candidate.exists():
        return candidate
        
    base = Path(desired_name).stem
    
    # Check if ends with _\d+
    import re
    match = re.search(r'_(\d+)$', base)
    
    if match:
        num = int(match.group(1))
        prefix = base[:match.start()]
        idx = num + 1
    else:
        prefix = base
        idx = 1
        
    while True:
        new_name = f"{prefix}_{idx}.pt"
        candidate = directory / new_name
        if not candidate.exists():
            return candidate
        idx += 1