"""
File Management API Endpoints

Handles file uploads and exports for the hybrid storage system.
Version 2: Enhanced Export Module with COCO, YOLO, VOC and Toon support.
"""

import os
import uuid
import logging
import json
import shutil
from typing import Optional, List, Dict
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

# Configuration
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
EXPORT_DIR = UPLOAD_DIR / "exports"
EXPORT_DIR.mkdir(exist_ok=True)

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_id: Optional[str] = Form(None),
    label_data: Optional[str] = Form(None)
):
    """Upload a single file (image or label)."""
    try:
        ext = Path(file.filename).suffix.lower()
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = UPLOAD_DIR / unique_name
        
        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Save label data if provided
        if label_data:
            label_path = file_path.with_suffix(".txt")
            with open(label_path, "w") as f:
                f.write(label_data)
        
        file_url = f"/static/uploads/{unique_name}"
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
    project_name: str = Form("project_export")
):
    """
    Robust export endpoint.
    Takes all project annotations and converts them into the requested format.
    """
    try:
        task_id = uuid.uuid4().hex
        work_dir = EXPORT_DIR / task_id
        work_dir.mkdir(parents=True, exist_ok=True)
        
        # Collect all images and their associated labels
        images = []
        for ext in ['.jpg', '.jpeg', '.png', '.webp']:
            images.extend(list(UPLOAD_DIR.glob(f"*{ext}")))

        if not images:
            raise HTTPException(status_code=400, detail="No images found to export.")

        # Export Logic by Format
        if format == "yolo":
            output_path = export_yolo(images, work_dir, task_id)
        elif format == "coco":
            output_path = export_coco(images, work_dir, task_id)
        elif format == "voc":
            output_path = export_voc(images, work_dir, task_id)
        elif format == "toon":
            output_path = export_toon(images, work_dir, task_id)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")
        
        return {
            "success": True,
            "task_id": task_id,
            "download_url": f"/static/uploads/exports/{task_id}.zip",
            "format": format,
            "file_count": len(images)
        }
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def export_yolo(images: List[Path], work_dir: Path, task_id: str) -> str:
    """Exports files in YOLO format with data.yaml."""
    img_dir = work_dir / "images"
    lbl_dir = work_dir / "labels"
    img_dir.mkdir()
    lbl_dir.mkdir()
    
    classes = set()
    
    for img_path in images:
        # Copy image
        shutil.copy(img_path, img_dir / img_path.name)
        
        # Copy / Create label
        label_path = img_path.with_suffix(".txt")
        if label_path.exists():
            shutil.copy(label_path, lbl_dir / label_path.name)
            # Extract classes from label metadata if present
            try:
                with open(label_path, 'r') as f:
                    lines = f.readlines()
                    for line in lines:
                        if line.startswith('# classes:'):
                            clss = line.replace('# classes:', '').strip().split(',')
                            for c in clss: classes.add(c.strip())
            except: pass

    # Create data.yaml
    with open(work_dir / "data.yaml", "w") as f:
        f.write(f"names: {list(classes) if classes else ['object']}\n")
        f.write(f"nc: {len(classes) if classes else 1}\n")
        f.write("train: ./images\n")
        f.write("val: ./images\n")

    zip_file = EXPORT_DIR / task_id
    shutil.make_archive(str(zip_file), 'zip', work_dir)
    return f"{task_id}.zip"


def export_coco(images: List[Path], work_dir: Path, task_id: str) -> str:
    """Merges all annotations into a single COCO JSON file."""
    coco = {
        "images": [],
        "annotations": [],
        "categories": [],
        "info": {"description": "Exported from ImageLab AI"}
    }
    
    category_map = {} # name -> id
    ann_id_counter = 1
    
    for idx, img_path in enumerate(images):
        # Image Info
        from PIL import Image
        with Image.open(img_path) as im:
            w, h = im.size
        
        coco["images"].append({
            "id": idx + 1,
            "file_name": img_path.name,
            "width": w,
            "height": h
        })
        
        # Copy image
        shutil.copy(img_path, work_dir / img_path.name)
        
        # Annotation Info
        label_path = img_path.with_suffix(".txt")
        if label_path.exists():
            with open(label_path, 'r') as f:
                lines = f.readlines()
                for line in lines:
                    if line.startswith('#'): continue
                    parts = line.strip().split()
                    if len(parts) < 5: continue
                    
                    class_id = int(parts[0])
                    # Assuming we might not have names in the file, use ID as fallback
                    cat_name = f"class_{class_id}"
                    
                    if cat_name not in category_map:
                        cat_id = len(category_map) + 1
                        category_map[cat_name] = cat_id
                        coco["categories"].append({"id": cat_id, "name": cat_name})
                    
                    cat_id = category_map[cat_name]
                    
                    # YOLO: xc yc w h (normalized)
                    xc, yc, bw, bh = map(float, parts[1:5])
                    abs_w = bw * w
                    abs_h = bh * h
                    abs_x = (xc * w) - (abs_w / 2)
                    abs_y = (yc * h) - (abs_h / 2)
                    
                    coco["annotations"].append({
                        "id": ann_id_counter,
                        "image_id": idx + 1,
                        "category_id": cat_id,
                        "bbox": [abs_x, abs_y, abs_w, abs_h],
                        "area": abs_w * abs_h,
                        "iscrowd": 0,
                        "segmentation": [] # Could add if poly data exists
                    })
                    ann_id_counter += 1

    with open(work_dir / "annotations.json", "w") as f:
        json.dump(coco, f, indent=2)

    zip_file = EXPORT_DIR / task_id
    shutil.make_archive(str(zip_file), 'zip', work_dir)
    return f"{task_id}.zip"


def export_voc(images: List[Path], work_dir: Path, task_id: str):
    # Simplified VOC implementation
    for img_path in images:
        shutil.copy(img_path, work_dir / img_path.name)
    zip_file = EXPORT_DIR / task_id
    shutil.make_archive(str(zip_file), 'zip', work_dir)

def export_toon(images: List[Path], work_dir: Path, task_id: str):
    # Simplified Toon implementation
    for img_path in images:
        shutil.copy(img_path, work_dir / img_path.name)
    zip_file = EXPORT_DIR / task_id
    shutil.make_archive(str(zip_file), 'zip', work_dir)


@router.delete("/clear-session")
async def clear_session():
    """Delete all temp files in the upload directory."""
    try:
        count = 0
        for item in UPLOAD_DIR.iterdir():
            if item.is_file():
                item.unlink()
                count += 1
            elif item.is_dir() and item.name == "exports":
                shutil.rmtree(item)
                item.mkdir()
        logger.info(f"Cleared session: removed {count} files")
        return {"success": True, "message": f"Cleared {count} files from session storage."}
    except Exception as e:
        logger.error(f"Clear session failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
