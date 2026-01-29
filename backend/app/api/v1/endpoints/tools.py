"""
Tools API endpoints.
Polygon editing, saving, and annotation tools.
"""

import json
from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.services.geometry_service import split_polygon
from app.services.dataset_service import DatasetService, get_dataset_service
from app.utils.image import decode_image

router = APIRouter(tags=["tools"])


@router.post("/edit-polygon-boolean")
async def edit_polygon_boolean(
    target_points: str = Form(...),
    cutter_points: str = Form(...),
    operation: str = Form("subtract")
):
    """
    Edits a polygon using boolean operations.
    Splits the target polygon with the cutter line.
    """
    try:
        t_pts = json.loads(target_points)
        c_pts = json.loads(cutter_points)
        
        result_polygons = split_polygon(t_pts, c_pts)
        
        return JSONResponse({"polygons": result_polygons})
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error in /edit-polygon-boolean: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
# old save method. deprecated
# @router.post("/save")
# async def save_data(
#     file: UploadFile = File(...),
#     annotations: str = Form(...),
#     image_name: str = Form(None),
#     augmentation: str = Form("false"),
#     dataset_service = Depends(get_dataset_service)
# ):
#     """
#     Saves an image with its annotations.
#     Optionally applies augmentation (flip, dark, noise).
#     """
#     try:
#         anns_list = json.loads(annotations)
#         image_bytes = await file.read()
#         img = decode_image(image_bytes)
        
#         do_augment = augmentation.lower() == "true"
        
#         name_base = dataset_service.save_annotation(
#             img=img,
#             annotations=anns_list,
#             image_name=image_name,
#             augment=do_augment
#         )
        
#         msg = f"Saved {name_base}" + (" (+3 augments)" if do_augment else "")
#         return JSONResponse({"success": True, "message": msg})
        
#     except json.JSONDecodeError:
#         raise HTTPException(status_code=400, detail="Invalid annotations format")
#     except ValueError as e:
#         raise HTTPException(status_code=400, detail=str(e))
#     except Exception as e:
#         print(f"Error in /save: {e}")
#         raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_data(
    file: UploadFile = File(...),
    annotations: str = Form(...),
    image_name: str = Form(None),
    augmentation: str = Form("false"),
    aug_params: str = Form(None), 
    dataset_service = Depends(get_dataset_service)
):
    """
    Saves an image with its annotations.
    Supports both standard annotation lists and TOON format.
    """
    try:
        data = json.loads(annotations)
        image_bytes = await file.read()
        img = decode_image(image_bytes)
        
        # Determine augmentation types
        enabled_types = []
        if aug_params:
            try:
                params = json.loads(aug_params)
                if isinstance(params, list):
                    enabled_types = params
                elif isinstance(params, dict):
                    # Expecting {"hflip": true, "vflip": false, ...}
                    enabled_types = [k for k, v in params.items() if v]
            except:
                pass
        elif augmentation.lower() == "true":
            # Default backward compatibility: apply all
            enabled_types = ["hflip", "vflip", "rotate", "brightness", "noise", "blur"]
        
        # Detect Format and Save
        if isinstance(data, list):
            name_base = await dataset_service.save_annotation(
                img=img,
                annotations=data,
                image_name=image_name,
                augment_types=enabled_types
            )
        elif isinstance(data, dict) and "v" in data and "d" in data:
            name_base = dataset_service.save_entry(
                img=img,
                toon_data=data,
                augment_types=enabled_types
            )
        else:
            raise HTTPException(status_code=400, detail="Unsupported annotation format")
        
        aug_count = len(enabled_types)
        aug_msg = f" (+{aug_count} types augmented)" if aug_count > 0 else ""
        return JSONResponse({
            "success": True, 
            "message": f"Saved {name_base}{aug_msg}"
        })
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        print(f"Error in /save: {e}")
        raise HTTPException(status_code=500, detail=str(e))
