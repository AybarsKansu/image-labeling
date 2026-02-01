
import shutil
import uuid
import glob
import os
import json
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import Depends

from app.core.config import get_settings
from app.models.sql_models import Project, Image
from app.core.database import get_db

class ProjectService:
    """
    Manages Project Data via SQLite + File System.
    """
    
    def __init__(self, db: Session):
        self.db = db
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

    def sync_projects_from_disk(self) -> int:
        """
        Scans disk for projects not in DB and registers them.
        Returns number of new projects found.
        """
        disk_projects = [d for d in self._projects_root.iterdir() if d.is_dir()]
        count = 0
        
        for p_dir in disk_projects:
            p_id = p_dir.name
            
            # Check if exists in DB
            db_project = self.db.query(Project).filter(Project.id == p_id).first()
            if db_project:
                continue
            
            # Create new project record
            print(f"Found new project on disk: {p_id}")
            
            # Try to read meta.json for name
            name = None
            meta_file = p_dir / "meta.json"
            if meta_file.exists():
                try:
                    with open(meta_file, "r") as f:
                        meta = json.load(f)
                        name = meta.get("name")
                except:
                    pass
            
            # Fallback name
            if not name:
                stat = p_dir.stat()
                dt = datetime.fromtimestamp(stat.st_ctime)
                name = f"Imported Project {dt.strftime('%Y-%m-%d')}"
            
            new_project = Project(
                id=p_id,
                name=name,
                path=str(p_dir),
                created_at=datetime.fromtimestamp(p_dir.stat().st_ctime)
            )
            self.db.add(new_project)
            
            # Sync Images for this project
            self._sync_project_images(new_project)
            
            count += 1
            
        self.db.commit()
        return count

    def _sync_project_images(self, project: Project):
        """Scans image directory and adds to files table."""
        img_dir = Path(project.path) / "raw_data" / "images"
        if not img_dir.exists():
            return
            
        # Get existing files in DB to avoid dupes
        existing_files = {
            i.filename for i in self.db.query(Image).filter(Image.project_id == project.id).all()
        }
        
        # Scan disk
        disk_files = [f.name for f in img_dir.iterdir() if f.is_file() and not f.name.startswith('.')]
        
        new_images = []
        for fname in disk_files:
            if fname not in existing_files:
                # Check if labeled (TXT or JSON)
                label_txt = Path(project.path) / "raw_data" / "labels" / (Path(fname).stem + ".txt")
                label_json = Path(project.path) / "raw_data" / "labels" / (Path(fname).stem + ".json")
                label_toon = Path(project.path) / "raw_data" / "labels" / (Path(fname).stem + ".toon")
                
                is_labeled = label_txt.exists() or label_json.exists() or label_toon.exists()
                
                new_images.append(Image(
                    project_id=project.id,
                    filename=fname,
                    is_labeled=is_labeled
                ))
        
        if new_images:
            self.db.bulk_save_objects(new_images)

    def create_project(self, name: str, description: str = None) -> Project:
        """Creates a new project in DB and Disk."""
        # 1. New ID
        new_id = str(uuid.uuid4())
        
        # 2. Create DB Record
        project = Project(
            id=new_id,
            name=name,
            description=description,
            path=str(self.get_project_path(new_id))
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        
        # 3. Create Folders
        self.ensure_project_structure(new_id)
        
        # 4. Save meta.json (for backup/compatibility)
        meta = {"id": new_id, "name": name, "description": description}
        with open(self.get_project_path(new_id) / "meta.json", "w") as f:
            json.dump(meta, f)
            
        return project

    def list_projects(self) -> List[Dict[str, Any]]:
        """Returns list of projects with stats."""
        projects = self.db.query(Project).all()
        results = []
        
        for p in projects:
            # Efficiently count images via DB
            img_count = self.db.query(func.count(Image.id)).filter(Image.project_id == p.id).scalar()
            
            results.append({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "file_count": img_count,
                "created_at": p.created_at.isoformat(),
                "path": p.path
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
        """Returns list of image filenames via DB."""
        # Ensure sync
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if project:
            self._sync_project_images(project)
            self.db.commit()
            
        images = self.db.query(Image).filter(Image.project_id == project_id).all()
        return [img.filename for img in images]

    def delete_project(self, project_id: str) -> bool:
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return False
            
        # Delete from DB
        self.db.delete(project)
        self.db.commit()
        
        # Delete from Disk
        p_path = Path(project.path)
        if p_path.exists():
            shutil.rmtree(p_path)
            
        return True
        
    def get_project_models(self, project_id: str) -> List[str]:
        p_path = self.get_project_path(project_id)
        models_dir = p_path / "models"
        
        if not models_dir.exists():
            return []
            
        return [f.name for f in models_dir.glob("*.pt")]

def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(db)

