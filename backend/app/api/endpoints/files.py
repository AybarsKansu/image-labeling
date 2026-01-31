# EXPORT LOGIC NO LONGER VISITS BACKEND!!!!





# """
# File Management API Endpoints

# Handles file exports for the saved dataset.
# Standardizes backend storage to .toon format and provides dynamic conversion.
# """

# import uuid
# import logging
# import json
# import shutil
# from typing import List
# from pathlib import Path
# from fastapi import APIRouter, Form, HTTPException

# from app.core.config import get_settings

# router = APIRouter(prefix="/files", tags=["files"])
# logger = logging.getLogger(__name__)

# # Configuration
# SETTINGS = get_settings()
# DATASET_DIR = SETTINGS.DATASET_DIR
# IMAGES_DIR = SETTINGS.images_dir
# LABELS_DIR = SETTINGS.labels_dir

# EXPORT_DIR = DATASET_DIR / "exports"
# EXPORT_DIR.mkdir(exist_ok=True)

# @router.post("/export")
# async def export_files(
#     format: str = Form("yolo"),
#     project_name: str = Form("project_export")
# ):
#     """
#     Export endpoint: Converts labels from the saved dataset into COCO, YOLO, VOC or packages as TOON.
#     This exports data that has been permanently saved to the /dataset folder.
#     """
#     try:
#         task_id = uuid.uuid4().hex
#         work_dir = EXPORT_DIR / task_id
#         work_dir.mkdir(parents=True, exist_ok=True)
        
#         # Collect all images from the dataset folder
#         images = []
#         for ext in ['.jpg', '.jpeg', '.png', '.webp']:
#             images.extend(list(IMAGES_DIR.glob(f"*{ext}")))

#         if not images:
#             raise HTTPException(status_code=400, detail="No images found in dataset to export. Please 'Save All' from the UI first.")

#         # Export Logic by Format
#         if format == "yolo":
#             export_yolo(images, work_dir, task_id)
#         elif format == "yolo_combined":
#             export_yolo_combined(images, work_dir)
#         elif format == "coco":
#             export_coco(images, work_dir, task_id)
#         elif format == "voc":
#             export_voc(images, work_dir, task_id)
#         elif format == "project_json":
#             export_project_json(images, work_dir)
#         elif format == "toon":
#             export_toon_bundle(images, work_dir, task_id)
#         else:
#             raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")
        
#         # Zip the results
#         zip_file = EXPORT_DIR / task_id
#         shutil.make_archive(str(zip_file), 'zip', work_dir)
        
#         return {
#             "success": True,
#             "task_id": task_id,
#             "download_url": f"/static/dataset/exports/{task_id}.zip",
#             "format": format,
#             "file_count": len(images)
#         }
#     except Exception as e:
#         logger.error(f"Export failed: {e}")
#         raise HTTPException(status_code=500, detail=str(e))


# def export_yolo(images: List[Path], work_dir: Path, task_id: str):
#     """Converts .toon to YOLO format with data.yaml."""
#     img_dir = work_dir / "images"
#     lbl_dir = work_dir / "labels"
#     img_dir.mkdir()
#     lbl_dir.mkdir()
    
#     classes = set()
    
#     for img_path in images:
#         shutil.copy(img_path, img_dir / img_path.name)
#         # Look for .toon label in labels directory
#         toon_path = LABELS_DIR / f"{img_path.stem}.toon"
        
#         if toon_path.exists():
#             with open(toon_path, 'r') as f:
#                 toon = json.load(f)
            
#             meta = toon.get("m", [None, 0, 0])
#             w, h = meta[1], meta[2]
#             yolo_lines = []
#             for item in toon.get("d", []):
#                 cls_id, pts = item[0], item[1]
#                 classes.add(str(cls_id))
                
#                 # Normalize points for YOLO
#                 if w > 0 and h > 0:
#                     norm_pts = []
#                     for i in range(0, len(pts), 2):
#                         norm_pts.append(f"{pts[i]/w:.6f}")
#                         norm_pts.append(f"{pts[i+1]/h:.6f}")
#                     yolo_lines.append(f"{cls_id} " + " ".join(norm_pts))
            
#             with open(lbl_dir / f"{img_path.stem}.txt", "w") as f:
#                 f.write("\n".join(yolo_lines))


# def export_yolo_combined(images: List[Path], work_dir: Path):
#     """Collects all labels into a single .txt file (Manifest/Combined format)."""
#     combined_content = []
#     for img_path in images:
#         toon_path = LABELS_DIR / f"{img_path.stem}.toon"
#         if toon_path.exists():
#             with open(toon_path, 'r') as f:
#                 toon = json.load(f)
#             meta = toon.get("m", [None, 0, 0])
#             w, h = meta[1], meta[2]
#             if w > 0 and h > 0:
#                 for item in toon.get("d", []):
#                     cls_id, pts = item[0], item[1]
#                     norm_pts = []
#                     for i in range(0, len(pts), 2):
#                         norm_pts.append(f"{pts[i]/w:.6f}")
#                         norm_pts.append(f"{pts[i+1]/h:.6f}")
                    
#                     line = f"{img_path.name} {cls_id} " + " ".join(norm_pts)
#                     combined_content.append(line)
    
#     with open(work_dir / "combined_labels.txt", "w") as f:
#         f.write("\n".join(combined_content))


# def export_project_json(images: List[Path], work_dir: Path):
#     """Merges all project .toon files into a single master JSON file."""
#     project_data = {
#         "project": "ImageLab Comprehensive Export",
#         "total_images": len(images),
#         "images": []
#     }
#     for img_path in images:
#         toon_path = LABELS_DIR / f"{img_path.stem}.toon"
#         if toon_path.exists():
#             with open(toon_path, 'r') as f:
#                 project_data["images"].append(json.load(f))
                
#     with open(work_dir / "project_full.toon", "w") as f:
#         json.dump(project_data, f, indent=2)


# def export_coco(images: List[Path], work_dir: Path, task_id: str):
#     """Merges all .toon annotations into a single COCO JSON file."""
#     coco = {
#         "images": [],
#         "annotations": [],
#         "categories": [],
#         "info": {"description": "Export from dataset"}
#     }
    
#     category_map = {} 
#     ann_id_counter = 1
    
#     # Load class mapping if exists
#     classes_file = DATASET_DIR / "classes.txt"
#     if classes_file.exists():
#         with open(classes_file, 'r') as f:
#             for idx, line in enumerate(f):
#                 name = line.strip()
#                 if name:
#                     category_map[name] = idx + 1
#                     coco["categories"].append({"id": idx + 1, "name": name})

#     for idx, img_path in enumerate(images):
#         toon_path = LABELS_DIR / f"{img_path.stem}.toon"
#         if not toon_path.exists(): continue
        
#         with open(toon_path, 'r') as f:
#             toon = json.load(f)
        
#         meta = toon.get("m", [img_path.name, 0, 0])
#         fname, w, h = meta
#         coco["images"].append({
#             "id": idx + 1,
#             "file_name": img_path.name,
#             "width": w,
#             "height": h
#         })
        
#         shutil.copy(img_path, work_dir / img_path.name)
        
#         for item in toon.get("d", []):
#             cls_id, pts = item[0], item[1]
#             cat_name = f"class_{cls_id}"
            
#             # Use class name if we have a mapping
#             if coco["categories"]:
#                 found_cat = next((c for c in coco["categories"] if c["id"] == (cls_id + 1)), None)
#                 if found_cat: cat_name = found_cat["name"]
            
#             if cat_name not in category_map:
#                 cat_id = len(category_map) + 1
#                 category_map[cat_name] = cat_id
#                 coco["categories"].append({"id": cat_id, "name": cat_name})
            
#             cat_id = category_map[cat_name]
            
#             x_coords = pts[0::2]
#             y_coords = pts[1::2]
#             min_x, max_x = min(x_coords), max(x_coords)
#             min_y, max_y = min(y_coords), max(y_coords)
#             bbox = [min_x, min_y, max_x - min_x, max_y - min_y]
            
#             coco["annotations"].append({
#                 "id": ann_id_counter,
#                 "image_id": idx + 1,
#                 "category_id": cat_id,
#                 "bbox": bbox,
#                 "area": bbox[2] * bbox[3],
#                 "iscrowd": 0,
#                 "segmentation": [pts]
#             })
#             ann_id_counter += 1

#     with open(work_dir / "annotations.json", "w") as f:
#         json.dump(coco, f, indent=2)


# def export_voc(images: List[Path], work_dir: Path, task_id: str):
#     """Converts .toon to Pascal VOC XML."""
#     for img_path in images:
#         shutil.copy(img_path, work_dir / img_path.name)
#         toon_path = LABELS_DIR / f"{img_path.stem}.toon"
        
#         if toon_path.exists():
#             with open(toon_path, 'r') as f:
#                 toon = json.load(f)
            
#             meta = toon.get("m", [None, 0, 0])
#             w, h = meta[1], meta[2]
#             xml_content = [
#                 "<annotation>",
#                 f"  <filename>{img_path.name}</filename>",
#                 "  <size>",
#                 f"    <width>{w}</width><height>{h}</height><depth>3</depth>",
#                 "  </size>"
#             ]
            
#             for item in toon.get("d", []):
#                 cls_id, pts = item[0], item[1]
#                 x_coords = pts[0::2]
#                 y_coords = pts[1::2]
#                 xml_content.extend([
#                     "  <object>",
#                     f"    <name>class_{cls_id}</name>",
#                     "    <bndbox>",
#                     f"      <xmin>{int(min(x_coords))}</xmin>",
#                     f"      <ymin>{int(min(y_coords))}</ymin>",
#                     f"      <xmax>{int(max(x_coords))}</xmax>",
#                     f"      <ymax>{int(max(y_coords))}</ymax>",
#                     "    </bndbox>",
#                     "  </object>"
#                 ])
#             xml_content.append("</annotation>")
            
#             with open(work_dir / f"{img_path.stem}.xml", "w") as f:
#                 f.write("\n".join(xml_content))


# def export_toon_bundle(images: List[Path], work_dir: Path, task_id: str):
#     """Packages images with their original .toon files."""
#     manifest = {"project": "ImageLab Export", "files": []}
#     for img_path in images:
#         shutil.copy(img_path, work_dir / img_path.name)
#         toon_path = LABELS_DIR / f"{img_path.stem}.toon"
#         if toon_path.exists():
#             shutil.copy(toon_path, work_dir / f"{img_path.stem}.toon")
#             manifest["files"].append(img_path.name)
    
#     with open(work_dir / "manifest.json", "w") as f:
#         json.dump(manifest, f, indent=2)
