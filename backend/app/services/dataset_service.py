"""
Dataset Service.
Handles data saving, augmentation, and preprocessing.
"""

import cv2
import numpy as np
import shutil
import glob
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional

from app.core.config import get_settings
from app.utils.image import get_slices
from app.services.geometry_service import intersect_polygon_with_box
from app.services.project_service import ProjectService, get_project_service

from shapely.geometry import Polygon as ShapelyPolygon
from shapely.validation import make_valid


class DatasetService:
    """Handles dataset operations including saving and preprocessing."""
    
    def __init__(self):
        self._settings = get_settings()
        self._project_service = get_project_service()
        # automatic creation disabled per user request
        # self._ensure_directories() 
    
    def _ensure_directories(self):
        """Ensure all required global directories exist (Legacy support)."""
        self._settings.images_dir.mkdir(parents=True, exist_ok=True)
        self._settings.labels_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_paths(self, project_id: Optional[str] = None):
        """Resolve images and labels directories based on project context."""
        if project_id:
            dirs = self._project_service.ensure_project_structure(project_id)
            return dirs["raw_images"], dirs["raw_labels"], dirs["root"] / "raw_data"
        else:
            # Fallback for legacy global dataset: Create only if needed
            self._ensure_directories()
            return self._settings.images_dir, self._settings.labels_dir, self._settings.DATASET_DIR
    
    async def save_annotation(
        self,
        img: np.ndarray,
        annotations: List[Dict[str, Any]],
        image_name: Optional[str] = None,
        augment_types: Optional[List[str]] = None,
        project_id: Optional[str] = None
    ) -> str:
        """
        Saves an image with its annotations and optional augmentations.
        """
        images_dir, labels_dir, base_dir = self._resolve_paths(project_id)

        # Determine filename
        if image_name:
            name_base = Path(image_name).stem
            ext = Path(image_name).suffix or ".jpg"
        else:
            name_base = str(uuid.uuid4())
            ext = ".jpg"

        # CLEANUP: Remove old augmentations for this file to prevent accumulation
        # Matches base_name_*.jpg (e.g. image_01_hflip.jpg)
        old_augs = list(images_dir.glob(f"{name_base}_*.jpg"))
        for old_img in old_augs:
            # Delete image
            try:
                old_img.unlink()
            except: pass
            
            # Delete corresponding label
            old_lbl = labels_dir / f"{old_img.stem}.txt"
            if old_lbl.exists():
                try:
                    old_lbl.unlink()
                except: pass
        
        # 1. Save Original
        self._save_toon_pair_from_anns("", img, annotations, name_base, ext, images_dir, labels_dir)
        
        if augment_types and len(augment_types) > 0:
            img_h, img_w = img.shape[:2]
            
            # Helper to augment and save
            def apply_aug(suffix, aug_img, mode=None):
                 # Transform annotations for this augmentation
                 aug_anns = self._transform_annotations(annotations, img_w, img_h, mode) if mode else annotations
                 self._save_toon_pair_from_anns(suffix, aug_img, aug_anns, name_base, ext, images_dir, labels_dir)

            if "hflip" in augment_types: apply_aug("_hflip", cv2.flip(img, 1), "hflip")
            if "vflip" in augment_types: apply_aug("_vflip", cv2.flip(img, 0), "vflip")
            
            if "rotate" in augment_types:
                apply_aug("_r90", cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE), "r90")
                apply_aug("_r180", cv2.rotate(img, cv2.ROTATE_180), "r180")
                apply_aug("_r270", cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE), "r270")
            
            if "brightness" in augment_types:
                apply_aug("_bright", cv2.convertScaleAbs(img, alpha=1.2, beta=30))
                apply_aug("_dark", cv2.convertScaleAbs(img, alpha=0.8, beta=-30))
            
            if "blur" in augment_types:
                apply_aug("_blur", cv2.GaussianBlur(img, (5, 5), 0))
            
            if "noise" in augment_types:
                noise = np.random.normal(0, 15, img.shape)
                apply_aug("_noise", np.clip(img + noise, 0, 255).astype(np.uint8))
        
        return name_base

    def _transform_annotations(self, annotations: List[Dict[str, Any]], w: int, h: int, mode: str) -> List[Dict[str, Any]]:
        """Helper to transform annotation coordinates based on augmentation mode."""
        transformed = []
        for a in annotations:
            new_a = a.copy()
            pts = a.get("points", [])
            new_pts = []
            
            for i in range(0, len(pts), 2):
                x, y = pts[i], pts[i+1]
                
                if mode == "hflip":
                    new_pts.extend([w - x, y])
                elif mode == "vflip":
                    new_pts.extend([x, h - y])
                elif mode == "r90":
                    # (x, y) -> (h - y, x)
                    new_pts.extend([h - y, x])
                elif mode == "r180":
                    # (x, y) -> (w - x, h - y)
                    new_pts.extend([w - x, h - y])
                elif mode == "r270":
                    # (x, y) -> (y, w - x)
                    new_pts.extend([y, w - x])
                else:
                    new_pts.extend([x, y])
            
            new_a["points"] = new_pts
            transformed.append(new_a)
        return transformed

    def save_entry(
        self,
        img: np.ndarray,
        toon_data: Dict[str, Any],
        augment_types: Optional[List[str]] = None,
        project_id: Optional[str] = None
    ) -> str:
        """
        Saves image and TOON annotations to dataset/images and dataset/labels.
        """
        images_dir, labels_dir, base_dir = self._resolve_paths(project_id)
        
        meta = toon_data.get("m", ["unknown.jpg", 0, 0])
        original_name = Path(meta[0]).stem
        img_w = meta[1]
        img_h = meta[2]
        
        base_name = original_name
        ext = ".jpg"
        
        # CLEANUP: Remove old augmentations
        old_augs = list(images_dir.glob(f"{base_name}_*.jpg"))
        for old_img in old_augs:
            try: old_img.unlink() 
            except: pass
            
            # Delete corresponding TOON label
            old_lbl = labels_dir / f"{old_img.stem}.toon"
            if old_lbl.exists():
                try: old_lbl.unlink()
                except: pass

        # 1. Save Original
        self._save_toon_pair("", img, toon_data, base_name, ext, images_dir, labels_dir)
        
        if augment_types and len(augment_types) > 0:
            # Re-use geometric transforms via a helper or direct implementation
            # For TOON, we need to transform the toon_data["d"] array
            
            modes_to_apply = []
            if "hflip" in augment_types: modes_to_apply.append(("_hflip", cv2.flip(img, 1), "hflip"))
            if "vflip" in augment_types: modes_to_apply.append(("_vflip", cv2.flip(img, 0), "vflip"))
            if "rotate" in augment_types:
                modes_to_apply.append(("_r90", cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE), "r90"))
                modes_to_apply.append(("_r180", cv2.rotate(img, cv2.ROTATE_180), "r180"))
                modes_to_apply.append(("_r270", cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE), "r270"))
            
            for suffix, aug_img, mode in modes_to_apply:
                aug_toon = toon_data.copy()
                original_data = toon_data.get("d", [])
                new_data = []
                
                for item in original_data:
                    cat_idx, pts = item[0], item[1]
                    new_pts = []
                    for i in range(0, len(pts), 2):
                        x, y = pts[i], pts[i+1]
                        if mode == "hflip": new_pts.extend([img_w - x, y])
                        elif mode == "vflip": new_pts.extend([x, img_h - y])
                        elif mode == "r90": new_pts.extend([img_h - y, x])
                        elif mode == "r180": new_pts.extend([img_w - x, img_h - y])
                        elif mode == "r270": new_pts.extend([y, img_w - x])
                    new_data.append([cat_idx, new_pts])
                
                aug_toon["d"] = new_data
                # Update dimensions for rotations
                if mode in ["r90", "r270"]:
                    aug_toon["m"] = [aug_toon["m"][0], img_h, img_w]
                
                self._save_toon_pair(suffix, aug_img, aug_toon, base_name, ext)
            
            # Pixel Augmentations (no coordinate change)
            pixel_augs = {}
            if "brightness" in augment_types:
                pixel_augs["_bright"] = cv2.convertScaleAbs(img, alpha=1.2, beta=30)
                pixel_augs["_dark"] = cv2.convertScaleAbs(img, alpha=0.8, beta=-30)
            if "noise" in augment_types:
                pixel_augs["_noise"] = np.clip(img + np.random.normal(0, 15, img.shape), 0, 255).astype(np.uint8)
            if "blur" in augment_types:
                pixel_augs["_blur"] = cv2.GaussianBlur(img, (5, 5), 0)
            
            for suffix, aug_img in pixel_augs.items():
                self._save_toon_pair(suffix, aug_img, toon_data, base_name, ext)
            
        return base_name

    def _save_toon_pair_from_anns(self, suffix, img, annotations, name_base, ext, images_dir, labels_dir):
        """Constructs TOON data from annotations and saves pair."""
        fname = f"{name_base}{suffix}{ext}"
        h, w = img.shape[:2]
        
        # 1. Build Class Map & Data
        # We need the global class map to assign valid IDs, but TOON format just uses IDs.
        # Assuming frontend sent valid labels or we map them.
        # For simplicity, we just use the class map from disk or create logic
        
        # NOTE: To ensure consistency, we should ensure classes exist in classes.txt
        # But for strictly saving JSON, we can just save what we have if we want.
        # However, to be useful, let's map text labels to IDs if possible.
        
        base_dir = self._settings.DATASET_DIR # Or project root? Not easily avail here without passing.
        # Rely on frontend passing IDs? Usually frontend passes "label": "bird"
        # Let's map dynamically
        
        root_dir = labels_dir.parent.parent # raw_data/labels -> raw_data -> root
        if "raw_data" not in str(root_dir): # fallback
             root_dir = self._settings.DATASET_DIR
             
        class_map = self._load_class_map(root_dir)
        
        toon_data_list = []
        for ann in annotations:
            label = ann.get("label", "unknown")
            points = ann.get("points", [])
            
            if label not in class_map:
                class_map[label] = len(class_map)
                self._append_class(label, root_dir)
                
            cls_id = class_map[label]
            toon_data_list.append([cls_id, points])
            
        toon_struct = {
            "m": [fname, w, h],
            "d": toon_data_list
        }
        
        self._save_toon_pair(suffix, img, toon_struct, name_base, ext, images_dir, labels_dir)


    def _save_toon_pair(self, suffix, img, toon_data, base_name, ext, images_dir: Path, labels_dir: Path):
        """Helper to save image and .toon file."""
        # Save Image
        fname = f"{base_name}{suffix}{ext}"
        img_path = images_dir / fname
        cv2.imwrite(str(img_path), img)
        
        # Save TOON
        import json
        tname = f"{base_name}{suffix}.toon"
        lbl_path = labels_dir / tname
        
        # Update filename in metadata for consistency
        final_toon = toon_data.copy()
        meta = final_toon.get("m", [])
        if meta:
            new_meta = [fname, meta[1], meta[2]]
            final_toon["m"] = new_meta
            
        with open(lbl_path, "w") as f:
            json.dump(final_toon, f)

    
    def _read_toon_labels(self, json_path: Path) -> List[tuple]:
        """Read TOON format labels and convert to normalized YOLO polys."""
        polygons = []
        try:
            with open(json_path, "r") as f:
                data = json.load(f)
            
            meta = data.get("m", [])
            if len(meta) < 3: return []
            w, h = meta[1], meta[2] # Image dims
            
            items = data.get("d", [])
            for item in items:
                # item is [cls_id, [x1, y1, x2, y2...]]
                if len(item) < 2: continue
                cls_id = item[0]
                points = item[1]
                
                # Normalize
                norm_pts = []
                for i in range(0, len(points), 2):
                    nx = points[i] / w
                    ny = points[i+1] / h
                    norm_pts.append(max(0, min(1, nx)))
                    norm_pts.append(max(0, min(1, ny)))
                
                polygons.append((cls_id, norm_pts))
                
        except Exception as e:
            print(f"Error reading TOON {json_path}: {e}")
            
        return polygons

    
    def _load_class_map(self, base_dir: Path) -> Dict[str, int]:
        """Load class name to ID mapping from classes.txt."""
        classes_file = base_dir / "classes.txt"
        if not classes_file.exists():
            classes_file.touch()
            return {}
        
        with open(classes_file, "r") as f:
            classes = [l.strip() for l in f.readlines() if l.strip()]
        
        return {name: i for i, name in enumerate(classes)}
    
    def _append_class(self, label: str, base_dir: Path = None):
        """Append a new class to classes.txt."""
        target_dir = base_dir or self._settings.DATASET_DIR
        classes_file = target_dir / "classes.txt"
        with open(classes_file, "a") as f:
            f.write(f"\n{label}")
    
    def preprocess_dataset(
        self,
        resize_mode: str = "none",
        enable_tiling: bool = False,
        tile_size: int = 640,
        tile_overlap: float = 0.2
    ) -> bool:
        """
        Preprocesses dataset with optional tiling and resizing.
        
        Args:
            resize_mode: "none", "640", or "1024"
            enable_tiling: Whether to tile images
            tile_size: Size of tiles
            tile_overlap: Overlap between tiles
            
        Returns:
            True if successful
        """
        print("Preprocessing: Cleaning old data...")
        
        # Clean processed directory
        if self._settings.processed_dir.exists():
            shutil.rmtree(self._settings.processed_dir)
        
        self._settings.processed_images_dir.mkdir(parents=True, exist_ok=True)
        self._settings.processed_labels_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy classes.txt
        classes_file = self._settings.DATASET_DIR / "classes.txt"
        if classes_file.exists():
            shutil.copy(classes_file, self._settings.processed_dir / "classes.txt")
        
        image_files = list(self._settings.images_dir.glob("*"))
        total_images = len(image_files)
        
        resize_map = {"640": 640, "1024": 1024}
        target_resize = resize_map.get(resize_mode)
        
        print(f"DEBUG: preprocess_dataset called with enable_tiling={enable_tiling}, resize_mode={resize_mode}")
        print(f"DEBUG: Found {total_images} images in {self._settings.images_dir}")
        print(f"Starting Preprocessing: {total_images} images. Tiling={enable_tiling}, Resize={target_resize}")
        
        for i, img_path in enumerate(image_files):
            try:
                img = cv2.imread(str(img_path))
                if img is None:
                    continue
                
                h, w = img.shape[:2]
                
                # Read labels
                label_path = self._settings.labels_dir / (img_path.stem + ".txt")
                polygons = self._read_labels(label_path)
                
                if enable_tiling:
                    self._process_tiled(
                        img, polygons, img_path.stem, 
                        tile_size, tile_overlap, target_resize
                    )
                else:
                    self._process_simple(
                        img, polygons, img_path.name, target_resize
                    )
                    
            except Exception as e:
                print(f"Failed to process {img_path}: {e}")
        
        print("Preprocessing Complete.")
        return True
    
    def _read_labels(self, label_path: Path) -> List[tuple]:
        """Read labels from file (trying TXT first, then JSON)."""
        polygons = []
        
        # Priority 1: JSON (TOON) - Richer data
        json_path = label_path.with_suffix(".json") # or .toon
        # Support both .json and .toon? User code uses .toon in save_entry helper but .json logic elsewhere
        # Let's check both
        toon_path = label_path.with_suffix(".toon")
        
        target_json = None
        if json_path.exists(): target_json = json_path
        elif toon_path.exists(): target_json = toon_path
            
        if target_json:
            return self._read_toon_labels(target_json)

        # Priority 2: TXT (Legacy YOLO)
        if label_path.exists():
            with open(label_path, "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) > 1:
                        cls_id = int(parts[0])
                        coords = [float(x) for x in parts[1:]]
                        polygons.append((cls_id, coords))
                        
        return polygons
    
    def _process_simple(
        self,
        img: np.ndarray,
        polygons: List[tuple],
        name: str,
        target_resize: Optional[int]
    ):
        """Process image without tiling."""
        if target_resize:
            img = cv2.resize(img, (target_resize, target_resize))
        
        cv2.imwrite(str(self._settings.processed_images_dir / name), img)
        
        if polygons:
            label_path = self._settings.processed_labels_dir / (Path(name).stem + ".txt")
            with open(label_path, "w") as f:
                for cls_id, pts in polygons:
                    line = f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n"
                    f.write(line)
    
    def _process_tiled(
        self,
        img: np.ndarray,
        polygons: List[tuple],
        name_base: str,
        tile_size: int,
        overlap: float,
        target_resize: Optional[int]
    ):
        """Process image with tiling."""
        h, w = img.shape[:2]
        slices = get_slices(h, w, tile_size, overlap)
        
        for s_idx, (x1, y1, x2, y2) in enumerate(slices):
            tile_img = img[y1:y2, x1:x2]
            th, tw = tile_img.shape[:2]
            
            if th < 10 or tw < 10:
                continue
            
            if target_resize:
                tile_img = cv2.resize(tile_img, (target_resize, target_resize))
            
            # Process polygons for this tile
            tile_polygons = []
            tile_box = ShapelyPolygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
            
            for cls_id, coords in polygons:
                # Denormalize
                abs_coords = []
                for k in range(0, len(coords), 2):
                    abs_coords.append((coords[k] * w, coords[k+1] * h))
                
                poly_shape = ShapelyPolygon(abs_coords)
                if not poly_shape.is_valid:
                    poly_shape = make_valid(poly_shape)
                
                try:
                    intersection = tile_box.intersection(poly_shape)
                    if intersection.is_empty:
                        continue
                    
                    geoms = self._extract_geoms(intersection)
                    
                    for g in geoms:
                        g_coords = list(g.exterior.coords)
                        flattened = []
                        for gx, gy in g_coords[:-1]:
                            nx = (gx - x1) / tw
                            ny = (gy - y1) / th
                            nx = min(max(nx, 0), 1)
                            ny = min(max(ny, 0), 1)
                            flattened.extend([nx, ny])
                        
                        if len(flattened) >= 6:
                            tile_polygons.append((cls_id, flattened))
                            
                except Exception as e:
                    print(f"Poly Error: {e}")
            
            # Save only if has labels
            if tile_polygons:
                tile_name = f"{name_base}_t{s_idx}.jpg"
                cv2.imwrite(str(self._settings.processed_images_dir / tile_name), tile_img)
                
                with open(self._settings.processed_labels_dir / f"{name_base}_t{s_idx}.txt", "w") as f:
                    for cls_id, pts in tile_polygons:
                        line = f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n"
                        f.write(line)
    
    def _extract_geoms(self, geometry):
        """Extract Polygon geometries from any geometry type."""
        geoms = []
        if geometry.geom_type == 'Polygon':
            geoms.append(geometry)
        elif geometry.geom_type == 'MultiPolygon':
            geoms.extend(geometry.geoms)
        elif geometry.geom_type == 'GeometryCollection':
            for g in geometry.geoms:
                if g.geom_type == 'Polygon':
                    geoms.append(g)
        return geoms

    def prepare_training_job(
        self,
        job_id: str,
        project_id: str,
        resize_mode: str = "none",
        tiling_config: Optional[Dict] = None
    ) -> Path:
        """
        Creates a staging area for training, copies data, runs preprocessing, 
        and generates data.yaml.
        """
        # Source Paths
        src_dirs = self._project_service.ensure_project_structure(project_id)
        src_img_dir = src_dirs["raw_images"]
        src_lbl_dir = src_dirs["raw_labels"]
        src_classes_file = src_dirs["root"] / "raw_data" / "classes.txt"
        
        # Staging Paths
        job_dir = self._settings.BASE_DIR / "temp" / "training_jobs" / job_id
        stage_images = job_dir / "images"
        stage_labels = job_dir / "labels"
        stage_images.mkdir(parents=True, exist_ok=True)
        stage_labels.mkdir(parents=True, exist_ok=True)
        
        # 1. Copy Data to Staging
        # TODO: This might be slow for massive datasets. Consider symlinks?
        # But user asked for "Kopyala" (Copy) explicitly to support Preprocessing.
        
        # We need to copy classes.txt first
        if src_classes_file.exists():
            shutil.copy(src_classes_file, job_dir / "classes.txt")
        else:
            # Create empty if not exists
            (job_dir / "classes.txt").touch()

        # Copy pairs
        valid_images = []
        for img_path in src_img_dir.glob("*"):
            if img_path.suffix.lower() not in ['.jpg', '.png', '.jpeg', '.bmp']: 
                continue
                
            shutil.copy(img_path, stage_images / img_path.name)
            
            # Copy corresponding label
            lbl_name = img_path.stem + ".txt"
            src_lbl = src_lbl_dir / lbl_name
            if src_lbl.exists():
                shutil.copy(src_lbl, stage_labels / lbl_name)
            
            valid_images.append(stage_images / img_path.name)

        # 2. Preprocess (Tiling/Resize) - IN PLACE (in staging)
        # Reuse existing preprocessing logic logic but adapted for arbitrary directories
        # For simplicity, we implement a direct mini-preprocessor here or refactor preprocess_dataset
        # Let's call a private _process_directory method
        
        self._preprocess_directory(
            images_dir=stage_images,
            labels_dir=stage_labels,
            resize_mode=resize_mode,
            tiling_config=tiling_config
        )

        # 3. Generate data.yaml
        yaml_path = job_dir / "data.yaml"
        self._create_data_yaml(job_dir, yaml_path)
        
        return job_dir

    def prepare_multi_project_training_job(
        self,
        job_id: str,
        project_ids: List[str],
        resize_mode: str = "none",
        tiling_config: Optional[Dict] = None
    ) -> Path:
        """
        Unifies multiple projects into single training dataset with class remapping.
        Implements: Case normalization, class conflict resolution, and 80/20 split.
        """
        import random
        
        job_dir = self._settings.BASE_DIR / "temp" / "training_jobs" / job_id
        stage_images = job_dir / "images"
        stage_labels = job_dir / "labels"
        train_images = job_dir / "train" / "images"
        train_labels = job_dir / "train" / "labels"
        val_images = job_dir / "val" / "images"
        val_labels = job_dir / "val" / "labels"
        
        # Create directories
        for d in [stage_images, stage_labels, train_images, train_labels, val_images, val_labels]:
            d.mkdir(parents=True, exist_ok=True)
        
        # Step 1: Build Master Class List with case normalization
        all_classes = []
        project_class_maps = {}  # {project_id: ["class1", "class2", ...]}
        
        for pid in project_ids:
            classes = self._project_service.get_classes(pid)
            project_class_maps[pid] = classes
            for cls in classes:
                normalized = cls.strip().lower()
                if normalized not in all_classes:
                    all_classes.append(normalized)
        
        print(f"[MultiProject] Master class list: {all_classes}")
        
        # Step 2: Build remap tables for each project
        project_remaps = {}  # {project_id: {old_id: new_id}}
        
        for pid, classes in project_class_maps.items():
            remap = {}
            for old_id, cls in enumerate(classes):
                normalized = cls.strip().lower()
                new_id = all_classes.index(normalized)
                remap[old_id] = new_id
            project_remaps[pid] = remap
            print(f"[MultiProject] Remap for {pid[:8]}: {remap}")
        
        # Step 3: Copy & remap labels from all projects
        all_image_pairs = []  # [(img_path, lbl_path), ...]
        

        for pid in project_ids:
            src_dirs = self._project_service.ensure_project_structure(pid)
            src_img_dir = src_dirs["raw_images"]
            src_lbl_dir = src_dirs["raw_labels"]
            remap = project_remaps[pid]
            
            for img_path in src_img_dir.glob("*"):
                if img_path.suffix.lower() not in ['.jpg', '.png', '.jpeg', '.bmp']:
                    continue
                
                # Generate unique name to avoid collisions
                unique_name = f"{pid[:8]}_{img_path.name}"
                dst_img = stage_images / unique_name
                dst_lbl = stage_labels / f"{pid[:8]}_{img_path.stem}.txt"
                
                # Copy/symlink image
                shutil.copy(img_path, dst_img)
                
                # READ SOURCE LABEL (TXT or JSON) -> WRITE TARGET YOLO TXT
                base_lbl_name = img_path.stem
                
                # Try finding source label
                labels = []
                json_src = src_lbl_dir / f"{base_lbl_name}.json"
                toon_src = src_lbl_dir / f"{base_lbl_name}.toon"
                txt_src = src_lbl_dir / f"{base_lbl_name}.txt"
                
                if json_src.exists():
                     labels = self._read_toon_labels(json_src)
                elif toon_src.exists():
                     labels = self._read_toon_labels(toon_src)
                elif txt_src.exists():
                     # Read legacy txt
                     with open(txt_src, "r") as f:
                        for line in f:
                            parts = line.strip().split()
                            if len(parts) > 1:
                                labels.append((int(parts[0]), [float(x) for x in parts[1:]]))
                
                # Write Remapped TXT
                if labels:
                    lines = []
                    for cls_id, coords in labels:
                        new_cls = remap.get(cls_id, cls_id)
                        # coords are already normalized 0-1 from readers
                        coord_str = " ".join([f"{x:.6f}" for x in coords])
                        lines.append(f"{new_cls} {coord_str}")
                    
                    with open(dst_lbl, "w") as f:
                        f.write("\n".join(lines))
                    
                    all_image_pairs.append((dst_img, dst_lbl))

        
        # Step 4: Preprocess (Tiling/Resize) if needed
        self._preprocess_directory(
            images_dir=stage_images,
            labels_dir=stage_labels,
            resize_mode=resize_mode,
            tiling_config=tiling_config
        )
        
        # Step 5: Merge -> Shuffle -> Split 80/20
        # Re-collect after preprocessing (files may have changed)
        all_files = list(stage_images.glob("*"))
        random.shuffle(all_files)
        
        split_idx = int(len(all_files) * 0.8)
        train_set = all_files[:split_idx]
        val_set = all_files[split_idx:]
        
        print(f"[MultiProject] Split: {len(train_set)} train, {len(val_set)} val")
        
        # Move files to train/val directories
        for img_path in train_set:
            lbl_path = stage_labels / f"{img_path.stem}.txt"
            shutil.move(str(img_path), str(train_images / img_path.name))
            if lbl_path.exists():
                shutil.move(str(lbl_path), str(train_labels / lbl_path.name))
        
        for img_path in val_set:
            lbl_path = stage_labels / f"{img_path.stem}.txt"
            shutil.move(str(img_path), str(val_images / img_path.name))
            if lbl_path.exists():
                shutil.move(str(lbl_path), str(val_labels / lbl_path.name))
        
        # Cleanup staging directories
        shutil.rmtree(stage_images, ignore_errors=True)
        shutil.rmtree(stage_labels, ignore_errors=True)
        
        # Step 6: Write classes.txt and data.yaml
        with open(job_dir / "classes.txt", "w") as f:
            f.write("\n".join(all_classes))
        
        self._create_data_yaml_split(job_dir)
        
        return job_dir

    def _create_data_yaml_split(self, job_dir: Path):
        """Creates data.yaml with train/val split directories."""
        classes_file = job_dir / "classes.txt"
        names = []
        if classes_file.exists():
            with open(classes_file, "r") as f:
                names = [l.strip() for l in f.readlines() if l.strip()]
        
        content = f"""path: {job_dir.absolute()}
train: train/images
val: val/images

names:
"""
        for i, name in enumerate(names):
            content += f"  {i}: {name}\n"
        
        with open(job_dir / "data.yaml", "w") as f:
            f.write(content)

    def _create_data_yaml(self, job_dir: Path, yaml_path: Path):
        """Generates data.yaml for YOLO."""
        classes_file = job_dir / "classes.txt"
        names = []
        if classes_file.exists():
            with open(classes_file, "r") as f:
                names = [l.strip() for l in f.readlines() if l.strip()]
                
        # Create validation split? For now just use train=val
        # YOLO needs absolute paths usually.
        
        content = f"""
path: {job_dir.absolute()}
train: images
val: images

names:
"""
        for i, name in enumerate(names):
            content += f"  {i}: {name}\n"
            
        with open(yaml_path, "w") as f:
            f.write(content)

    def _preprocess_directory(self, images_dir: Path, labels_dir: Path, resize_mode: str, tiling_config: Optional[Dict]):
        """
        Runs inplace preprocessing on a directory.
        Actually, tiling creates NEW images. 
        So we should probably process FROM 'images' TO 'images_processed' then swap?
        Or just process 1-by-1 and delete originals if tiling is ON?
        
        The user requirement says: "Preprocessing: Tiling/Resize işlemlerini bu geçici klasör içinde yap."
        
        If tiling is enabled, we replace the content of images/labels with the tiled versions.
        """
        if not tiling_config and resize_mode == "none":
            return
            
        enable_tiling = tiling_config.get("enabled", False) if tiling_config else False
        tile_size = tiling_config.get("tile_size", 640) if tiling_config else 640
        overlap = tiling_config.get("overlap", 0.2) if tiling_config else 0.2
        
        resize_map = {"640": 640, "1024": 1024}
        target_resize = resize_map.get(resize_mode)
        
        # Temp output for processed files
        out_img_dir = images_dir.parent / "images_proc"
        out_lbl_dir = images_dir.parent / "labels_proc"
        out_img_dir.mkdir(exist_ok=True)
        out_lbl_dir.mkdir(exist_ok=True)
        
        all_images = list(images_dir.glob("*"))
        
        for img_path in all_images:
            try:
                img = cv2.imread(str(img_path))
                if img is None: continue
                
                # Read label
                lbl_path = labels_dir / (img_path.stem + ".txt")
                polygons = self._read_labels(lbl_path)
                
                # Switch settings to point to temp dirs for the _process_tiled helper?
                # _process_tiled uses self._settings.processed_images_dir...
                # We need to refactor _process_tiled to accept output dirs.
                # Instead of huge refactor, I'll essentially duplicate the logic purely for this 'sandbox' mode
                # to avoid breaking legacy global behavior.
                
                if enable_tiling:
                    # Logic adapted from _process_tiled
                    self._sandbox_tiled(img, polygons, img_path.stem, tile_size, overlap, target_resize, out_img_dir, out_lbl_dir)
                else:
                    self._sandbox_simple(img, polygons, img_path.name, target_resize, out_img_dir, out_lbl_dir)
                    
            except Exception as e:
                print(f"Sandbox Preprocess Error {img_path}: {e}")
                
        # Swap directories
        shutil.rmtree(images_dir)
        shutil.rmtree(labels_dir)
        out_img_dir.rename(images_dir)
        out_lbl_dir.rename(labels_dir)

    def _sandbox_simple(self, img, polygons, name, target_resize, out_i, out_l):
        if target_resize:
            img = cv2.resize(img, (target_resize, target_resize))
        cv2.imwrite(str(out_i / name), img)
        if polygons:
            with open(out_l / (Path(name).stem + ".txt"), "w") as f:
                for cls_id, pts in polygons:
                    f.write(f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n")

    def _sandbox_tiled(self, img, polygons, name_base, tile_size, overlap, target_resize, out_i, out_l):
        h, w = img.shape[:2]
        slices = get_slices(h, w, tile_size, overlap)
        
        for s_idx, (x1, y1, x2, y2) in enumerate(slices):
            tile_img = img[y1:y2, x1:x2]
            if tile_img.shape[0] < 10 or tile_img.shape[1] < 10: continue
            
            if target_resize:
                tile_img = cv2.resize(tile_img, (target_resize, target_resize))
            
            tile_polygons = []
            tile_box = ShapelyPolygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
             
            for cls_id, coords in polygons:
                abs_coords = [(coords[k] * w, coords[k+1] * h) for k in range(0, len(coords), 2)]
                poly_shape = make_valid(ShapelyPolygon(abs_coords))
                
                try:
                    intersection = tile_box.intersection(poly_shape)
                    if intersection.is_empty: continue
                    
                    geoms = self._extract_geoms(intersection)
                    for g in geoms:
                        flattened = []
                        for gx, gy in g.exterior.coords[:-1]:
                            nx = min(max((gx - x1) / tile_img.shape[1], 0), 1)
                            ny = min(max((gy - y1) / tile_img.shape[0], 0), 1)
                            flattened.extend([nx, ny])
                        if len(flattened) >= 6:
                            tile_polygons.append((cls_id, flattened))
                except: pass
            
            if tile_polygons:
                tname = f"{name_base}_t{s_idx}.jpg"
                cv2.imwrite(str(out_i / tname), tile_img)
                with open(out_l / f"{name_base}_t{s_idx}.txt", "w") as f:
                    for cls_id, pts in tile_polygons:
                        f.write(f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n")


def get_dataset_service():
    """FastAPI dependency for DatasetService."""
    return DatasetService()
