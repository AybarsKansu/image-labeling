
import shutil
import uuid
import glob
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

from app.core.config import get_settings

class ProjectService:
    """
    Manages Project Directory Structure:
    storage/
      projects/
        {uuid}/
          raw_data/
            images/
            labels/
          models/
          jobs/
    """
    
    def __init__(self):
        self._settings = get_settings()
        self._projects_root = self._settings.STORAGE_DIR / "projects"
        self._projects_root.mkdir(parents=True, exist_ok=True)
    
    def get_project_path(self, project_id: str) -> Path:
        return self._projects_root / project_id
        
    def ensure_project_structure(self, project_id: str) -> Dict[str, Path]:
        """Creates necessary subdirectories for a project."""
        p_path = self.get_project_path(project_id)
        
        paths = {
            "root": p_path,
            "raw_images": p_path / "raw_data" / "images",
            "raw_labels": p_path / "raw_data" / "labels",
            "models": p_path / "models",
            "jobs": p_path / "jobs"
        }
        
        for k, p in paths.items():
            p.mkdir(parents=True, exist_ok=True)
            
        return paths

    def list_projects(self) -> List[Dict[str, Any]]:
        """Scans the projects directory and returns metadata."""
        import json
        project_dirs = [d for d in self._projects_root.iterdir() if d.is_dir()]
        results = []
        
        for p_dir in project_dirs:
            # Count images
            try:
                img_count = len(list((p_dir / "raw_data" / "images").glob("*.*")))
            except:
                img_count = 0
                
            stat = p_dir.stat()
            created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
            
            # Read name from meta.json or generate from date
            name = None
            meta_file = p_dir / "meta.json"
            if meta_file.exists():
                try:
                    with open(meta_file, "r") as f:
                        meta = json.load(f)
                        name = meta.get("name")
                except:
                    pass
            
            if not name:
                # Generate name from creation date
                dt = datetime.fromtimestamp(stat.st_ctime)
                months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                         'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
                name = f"Proje - {dt.day} {months[dt.month-1]} {dt.hour:02d}:{dt.minute:02d}"
            
            results.append({
                "id": p_dir.name,
                "name": name,
                "file_count": img_count,
                "created_at": created_at,
                "path": str(p_dir)
            })
            
        return sorted(results, key=lambda x: x["created_at"], reverse=True)

    def get_classes(self, project_id: str) -> List[str]:
        """Read classes from project's classes.txt file."""
        p_path = self.get_project_path(project_id)
        classes_file = p_path / "raw_data" / "classes.txt"
        
        if not classes_file.exists():
            return []
        
        with open(classes_file, "r") as f:
            classes = [line.strip() for line in f.readlines() if line.strip()]
        
        return classes

    def get_project_files(self, project_id: str) -> List[str]:
        """Returns list of image filenames in the project."""
        p_path = self.get_project_path(project_id)
        img_dir = p_path / "raw_data" / "images"
        
        if not img_dir.exists():
            return []
            
        files = [f.name for f in img_dir.iterdir() if f.is_file() and not f.name.startswith('.')]
        return files

    def delete_project(self, project_id: str) -> bool:
        p_path = self.get_project_path(project_id)
        if p_path.exists():
            shutil.rmtree(p_path)
            return True
        return False
        
    def get_project_models(self, project_id: str) -> List[str]:
        p_path = self.get_project_path(project_id)
        models_dir = p_path / "models"
        
        if not models_dir.exists():
            return []
            
        return [f.name for f in models_dir.glob("*.pt")]

def get_project_service():
    return ProjectService()
