"""
File Management API Endpoints

Handles file uploads and exports for the hybrid storage system.
"""

import os
import uuid
import logging
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

# Configuration
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_id: Optional[str] = Form(None),
    label_data: Optional[str] = Form(None)
):
    """
    Upload a single file (image or label).
    
    Returns the backend URL for the uploaded file.
    """
    try:
        # Generate unique filename
        ext = Path(file.filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = UPLOAD_DIR / unique_name
        
        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Save label data if provided (as sidecar file)
        if label_data:
            label_path = file_path.with_suffix(".txt")
            with open(label_path, "w") as f:
                f.write(label_data)
        
        # Generate URL (relative path served by static mount)
        file_url = f"/static/uploads/{unique_name}"
        
        logger.info(f"Uploaded file: {file.filename} -> {file_url}")
        
        return {
            "success": True,
            "url": file_url,
            "filename": unique_name,
            "original_name": file.filename,
            "file_id": file_id
        }
        
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export")
async def export_files(
    format: str = Form("yolo"),
    background_tasks: BackgroundTasks = None
):
    """
    Export all uploaded files to the specified format.
    
    Supported formats: yolo, coco, voc
    
    Returns a task ID for async processing.
    """
    try:
        task_id = uuid.uuid4().hex
        
        # For MVP, we'll do synchronous export
        # In production, this would be a background task
        
        export_dir = UPLOAD_DIR / "exports" / task_id
        export_dir.mkdir(parents=True, exist_ok=True)
        
        # Collect all image/label pairs
        images = list(UPLOAD_DIR.glob("*.jpg")) + \
                 list(UPLOAD_DIR.glob("*.jpeg")) + \
                 list(UPLOAD_DIR.glob("*.png"))
        
        if format == "yolo":
            # Copy images and labels to export dir
            for img_path in images:
                label_path = img_path.with_suffix(".txt")
                
                # Copy image
                import shutil
                shutil.copy(img_path, export_dir / img_path.name)
                
                # Copy label if exists
                if label_path.exists():
                    shutil.copy(label_path, export_dir / label_path.name)
        
        # Create ZIP
        import shutil
        zip_path = UPLOAD_DIR / "exports" / f"{task_id}.zip"
        shutil.make_archive(str(zip_path.with_suffix("")), "zip", export_dir)
        
        return {
            "success": True,
            "task_id": task_id,
            "download_url": f"/static/uploads/exports/{task_id}.zip",
            "file_count": len(images)
        }
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/{task_id}/status")
async def get_export_status(task_id: str):
    """
    Get the status of an export task.
    """
    zip_path = UPLOAD_DIR / "exports" / f"{task_id}.zip"
    
    if zip_path.exists():
        return {
            "status": "completed",
            "download_url": f"/static/uploads/exports/{task_id}.zip"
        }
    
    export_dir = UPLOAD_DIR / "exports" / task_id
    if export_dir.exists():
        return {"status": "processing"}
    
    return {"status": "not_found"}
@router.delete("/clear-session")
async def clear_session():
    """
    Delete all temp files in the upload directory.
    """
    try:
        count = 0
        # Delete files in upload dir (non-recursively for safety of the dir itself)
        for item in UPLOAD_DIR.iterdir():
            if item.is_file():
                item.unlink()
                count += 1
            elif item.is_dir() and item.name == "exports":
                # Clean up exports too
                import shutil
                shutil.rmtree(item)
                item.mkdir()
        
        logger.info(f"Cleared session: removed {count} files")
        return {"success": True, "message": f"Cleared {count} files from session storage."}
    except Exception as e:
        logger.error(f"Clear session failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
