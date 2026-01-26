
import os
import shutil
import json
import traceback
from pathlib import Path
from ultralytics import YOLO
from fastapi import HTTPException

from app.core.config import get_settings
from app.services.model_manager import ModelManager
from app.services.dataset_service import DatasetService
from app.services.class_service import ClassService

# Global training status object
class TrainingStatus:
    def __init__(self):
        self.is_training = False
        self.stop_requested = False
        self.progress = 0.0
        self.epoch = 0
        self.total_epochs = 0
        self.message = "Idle"
    
    def dict(self):
        return {
            "is_training": self.is_training,
            "stop_requested": self.stop_requested,
            "progress": self.progress,
            "epoch": self.epoch,
            "total_epochs": self.total_epochs,
            "message": self.message
        }

_training_status = TrainingStatus()

class TrainingService:
    @staticmethod
    def get_status():
        return _training_status

    @staticmethod
    def request_stop():
        if _training_status.is_training:
            _training_status.stop_requested = True
            _training_status.message = "Stopping..."
            return True
        return False
        
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
    
            # 2. Prepare Data YAML
            classes = class_service.get_all_classes_sorted()
            
            # Use generated split files
            train_txt = settings.DATASET_DIR / "autosplit_train.txt"
            val_txt = settings.DATASET_DIR / "autosplit_val.txt"
            
            if not train_txt.exists() or not val_txt.exists():
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
                yaml_content += f"  {i}: {c}\\n"
            
            yaml_path = settings.DATASET_DIR / "data.yaml"
            with open(yaml_path, "w", encoding="utf-8") as f:
                f.write(yaml_content)
    
            # 3. Model Training
            _training_status.message = "Starting training..."
            
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
                if _training_status.stop_requested:
                    raise InterruptedError("Training cancelled by user")
                _training_status.epoch = trainer.epoch + 1
                progress = 0.3 + ((trainer.epoch + 1) / epochs * 0.7)
                _training_status.progress = min(progress, 0.99)
                _training_status.message = f"Epoch {trainer.epoch + 1}/{epochs}"
            
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
                project="runs",
                name="train_job",
                exist_ok=True,
                val=True # Enable validation during training
            )
            
            _training_status.message = "Finalizing..."
            
            # 4. Save model
            best_pt = Path("runs/train_job/weights/best.pt")
            if best_pt.exists():
                models_dir = Path("models")
                models_dir.mkdir(exist_ok=True)
                
                target_name = custom_model_name.strip() if (custom_model_name and custom_model_name.strip()) else "custom_model.pt"
                final_path = TrainingService._get_unique_model_path(models_dir, target_name)
                    
                shutil.move(str(best_pt), str(final_path))
                
                model_manager.scan_models()
                _training_status.message = f"Completed! Saved as {final_path.name}"
                
                # Cleanup runs folder to save space? Optional.
                # shutil.rmtree("runs") 

            else:
                _training_status.message = "Failed: best.pt not found."
                
        except InterruptedError:
            _training_status.message = "Training Cancelled."
        except Exception as e:
            _training_status.message = f"Error: {e}"
            print(f"Training Error: {e}")
            traceback.print_exc()
        finally:
            _training_status.is_training = False
            _training_status.stop_requested = False

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

# Singleton instance for dependency injection if needed, 
# though static methods are fine here since state is global.
training_service = TrainingService()
