
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from typing import List, Optional
import json
from app.services.project_service import ProjectService, get_project_service
from app.services.dataset_service import DatasetService, get_dataset_service
import cv2
import numpy as np

router = APIRouter()

@router.get("", response_model=List[dict])
async def list_projects(
    service: ProjectService = Depends(get_project_service)
):
    """List all available projects."""
    return service.list_projects()

@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service)
):
    """Delete a project and its data."""
    success = service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "success"}

@router.get("/{project_id}/files")
async def list_project_files(
    project_id: str,
    service: ProjectService = Depends(get_project_service)
):
    """List raw images in a project."""
    files = service.get_project_files(project_id)
    return {"files": files}

@router.get("/{project_id}/models")
async def list_project_models(
    project_id: str,
    service: ProjectService = Depends(get_project_service)
):
    """List trained models for a project."""
    models = service.get_project_models(project_id)
    return {"models": models}

@router.post("/{project_id}/sync")
async def sync_project_data(
    project_id: str,
    file: UploadFile = File(...),
    image_name: str = Form(...),
    annotations: str = Form(default="[]"),
    aug_params: str = Form(default=None),
    dataset_service: DatasetService = Depends(get_dataset_service)
):
    """
    Sync a single file from Frontend to Backend Storage.
    Replaces save_annotation logic but scoped to a project.
    """
    try:
        # Read image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
            
        # Parse annotations
        anns_list = json.loads(annotations)
        
        # Parse augmentations
        augment_types = []
        if aug_params:
            aug_data = json.loads(aug_params)
            if isinstance(aug_data, list):
                augment_types = aug_data
            elif isinstance(aug_data, dict):
                augment_types = aug_data.get("types", [])
            
        # Save using dataset service with project_id context
        saved_name = await dataset_service.save_annotation(
            img=img,
            annotations=anns_list,
            image_name=image_name,
            augment_types=augment_types,
            project_id=project_id
        )
        
        return {"status": "success", "saved_name": saved_name}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
