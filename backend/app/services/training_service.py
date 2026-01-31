
import os
import shutil
import json
import traceback
import uuid
from pathlib import Path
from ultralytics import YOLO
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.model_manager import ModelManager
from app.services.dataset_service import DatasetService
from app.services.class_service import ClassService
from app.services.task_service import TaskService
from app.schemas.tasks import TaskStatus
from app.core.database import SessionLocal

class TrainingService:
    @staticmethod
    def validate_model_for_training(base_model: str):
        """Checks if the model type supports fine-tuning."""
        base_model_lower = base_model.lower()
        
        # Models that CANNOT be trained with standard YOLO flow
        invalid_families = ["sam", "grounding", "dino", "clip"]
        
        if any(x in base_model_lower for x in invalid_families):
             raise HTTPException(
                status_code=400,
                detail=f"Model '{base_model}' is a Foundation Model (Zero-Shot/Segment-Anything) and cannot be fine-tuned via this API. Please use standard YOLO detection or segmentation models."
            )

    @staticmethod
    def run_training_task(
        task_id: str,
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
        class_service: ClassService,
        project_ids: list = None
    ):
        """Background task for model training (Multi-User Safe)."""
        settings = get_settings()
        
        # Create a fresh DB session for this thread/task
        db = SessionLocal()
        task_service = TaskService(db)
        
        try:
            task_service.update_task(task_id, status=TaskStatus.PROCESSING, progress=0.0, message="Initializing...")
            
            # 1. Preparation
            yaml_path = None
            runs_dir = "runs" # Default local
            job_id = f"job_{uuid.uuid4().hex[:8]}"
            
            # Determine project flow
            if project_ids and len(project_ids) > 0:
                # MULTI-PROJECT FLOW
                task_service.update_task(task_id, message=f"Preparing Job {job_id} ({len(project_ids)} projects)...", progress=0.05)
                
                # Helper to convert params
                resize_mode = 'none'
                if preprocess_params:
                    resize_mode = preprocess_params.get('resize_mode', 'none')
                
                # Prepare merged dataset with class remapping
                try:
                    job_dir = dataset_service.prepare_multi_project_training_job(
                        job_id=job_id,
                        project_ids=project_ids,
                        resize_mode=resize_mode,
                        tiling_config=preprocess_params
                    )
                except Exception as e:
                    raise RuntimeError(f"Dataset preparation failed: {e}")
                
                yaml_path = job_dir / "data.yaml"
                runs_dir = str(job_dir / "runs")
                
            else:
                # LEGACY FLOW
                # 1. Preprocessing (Includes Split & Remap)
                target_data_dir = settings.DATASET_DIR
                if preprocess_params is None:
                    preprocess_params = {}
                    
                task_service.update_task(task_id, message="Preprocessing...", progress=0.1)
                
                success = dataset_service.preprocess_dataset(
                    resize_mode=preprocess_params.get('resize_mode', 'none'),
                    enable_tiling=preprocess_params.get('enable_tiling', False),
                    tile_size=int(preprocess_params.get('tile_size', 640)),
                    tile_overlap=float(preprocess_params.get('tile_overlap', 0.2))
                )
                
                if success:
                    target_data_dir = settings.processed_dir # Use 'dataset/processed'
        
                # 2. Prepare Data YAML
                classes = class_service.get_all_classes_sorted()
                
                # Paths relative to settings.DATASET_DIR for YAML clarity
                train_txt = settings.DATASET_DIR / "autosplit_train.txt"
                val_txt = settings.DATASET_DIR / "autosplit_val.txt"
                
                # Use relative paths if possible (YOLO prefers relative to 'path' key)
                if train_txt.exists() and val_txt.exists():
                    train_path_str = "autosplit_train.txt"
                    val_path_str = "autosplit_val.txt"
                else:
                    # Fallback to images folder if split missing
                    train_path_str = "images"
                    val_path_str = "images"
        
                yaml_content = f"path: {settings.DATASET_DIR.as_posix()}\n"
                yaml_content += f"train: {train_path_str}\n"
                yaml_content += f"val: {val_path_str}\n"
                yaml_content += "names:\n"
                
                for i, c in enumerate(classes):
                    clean_name = str(c).strip().replace('"', '\\"')
                    yaml_content += f"  {i}: \"{clean_name}\"\n"
                
                yaml_path = settings.DATASET_DIR / "data.yaml"
                with open(yaml_path, "w", encoding="utf-8") as f:
                    f.write(yaml_content)

            # 3. Model Training
            task_service.update_task(task_id, message="Starting training...", progress=0.2)
            
            # Resolve Base Model Path
            model_path = base_model_name
            if not os.path.exists(model_path):
                candidates = [
                    Path("models") / base_model_name,
                    Path("backend/models") / base_model_name,
                    Path("../models") / base_model_name
                ]
                for cand in candidates:
                    if cand.exists():
                        model_path = str(cand)
                        break
            
            print(f"Loading Base Model to start training: {model_path}")
            model = YOLO(model_path)
            
            def on_train_epoch_end(trainer):
                current_epoch = trainer.epoch + 1
                progress = 0.2 + ((current_epoch / epochs) * 0.7)
                msg = f"Epoch {current_epoch}/{epochs}"
                # Update DB every epoch
                task_service.update_task(task_id, progress=min(progress, 0.95), message=msg)
            
            model.add_callback("on_train_epoch_end", on_train_epoch_end)
            
            # Train
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
                project=runs_dir,
                name="train_job",
                exist_ok=True,
                val=True
            )
            
            task_service.update_task(task_id, message="Finalizing...", progress=0.95)
            
            # 4. Save model
            best_pt = Path(f"{runs_dir}/train_job/weights/best.pt")
            if best_pt.exists():
                
                target_project_id = None
                if project_ids and len(project_ids) > 0:
                    target_project_id = project_ids[0]
                
                if target_project_id:
                     # Save to Projects/models
                    from app.services.project_service import get_project_service
                    # Avoid creating new ProjectService here if we can reuse imports
                    # But get_project_service needs 'db' which we have
                    from app.services.project_service import ProjectService
                    ps = ProjectService(db)
                    
                    models_dir = ps.get_project_path(target_project_id) / "models"
                    models_dir.mkdir(exist_ok=True)
                else:
                    # Legacy Models dir
                    models_dir = Path("models")
                    models_dir.mkdir(exist_ok=True)
                
                target_name = custom_model_name.strip() if (custom_model_name and custom_model_name.strip()) else "custom_model.pt"
                final_path = TrainingService._get_unique_model_path(models_dir, target_name)
                    
                shutil.move(str(best_pt), str(final_path))
                
                # Cleanup job folder if project mode?
                if target_project_id:
                    try:
                        job_logs_dest = ps.get_project_path(target_project_id) / "jobs" / job_id
                        if Path(runs_dir).exists():
                             shutil.copytree(runs_dir, job_logs_dest, dirs_exist_ok=True)
                        shutil.rmtree(Path(runs_dir).parent, ignore_errors=True)
                    except Exception as e:
                        print(f"Log cleanup error: {e}")
                
                model_manager.scan_models()
                
                task_service.update_task(
                    task_id, 
                    status=TaskStatus.COMPLETED, 
                    progress=1.0, 
                    message=f"Completed",
                    result={"model_path": str(final_path), "model_name": final_path.name}
                )

            else:
                task_service.update_task(task_id, status=TaskStatus.FAILED, error="best.pt not found after training")
                
        except Exception as e:
            traceback.print_exc()
            task_service.update_task(task_id, status=TaskStatus.FAILED, error=str(e))
            
        finally:
            db.close() # Important to close the thread-local session

    @staticmethod
    def _get_unique_model_path(directory: Path, filename: str) -> Path:
        """Helper to avoid overwriting existing models."""
        base_name = filename.replace(".pt", "")
        extension = ".pt"
        counter = 1
        
        new_path = directory / filename
        while new_path.exists():
            new_path = directory / f"{base_name}_v{counter}{extension}"
            counter += 1
            
        return new_path

training_service = TrainingService()
