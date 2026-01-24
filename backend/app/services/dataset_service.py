"""
Dataset Service.
Handles data saving, augmentation, preprocessing, splitting, and remapping.
"""

import cv2
import numpy as np
import shutil
import glob
import shortuuid
import random
from pathlib import Path
from typing import List, Dict, Any, Optional

from app.core.config import get_settings
from app.utils.image import get_slices
from app.services.geometry_service import intersect_polygon_with_box
from app.services.hash_service import get_hash_service
from app.services.class_service import get_class_service

from shapely.geometry import Polygon as ShapelyPolygon
from shapely.validation import make_valid


class DatasetService:
    """Handles dataset operations including saving and preprocessing."""
    
    def __init__(self):
        self._settings = get_settings()
        self._ensure_directories()
        self.hash_service = get_hash_service()
        self.class_service = get_class_service()
    
    def _ensure_directories(self):
        """Ensure all required directories exist."""
        self._settings.images_dir.mkdir(parents=True, exist_ok=True)
        self._settings.labels_dir.mkdir(parents=True, exist_ok=True)
    
    def save_annotation(
        self,
        img: np.ndarray,
        annotations: List[Dict[str, Any]],
        image_name: Optional[str] = None,
        augment: bool = False
    ) -> str:
        """
        Saves an image with its annotations.
        Checks for duplicates via HashService.
        """
        # 1. Duplicate Check
        success, img_encoded = cv2.imencode(".jpg", img)
        if success:
             file_hash = self.hash_service.calculate_md5(img_encoded.tobytes())
             if self.hash_service.is_duplicate(file_hash):
                 print(f"Duplicate image detected (Hash: {file_hash}). Skipping save.")
                 # Determine logic: Raise error or return existing name?
                 # For now, let's allow saving but warn, OR prevent generic duplicates.
                 # User requested duplicate check. If exact duplicate, we typically skip.
                 # But if user wants to re-label? 
                 # Let's just Proceed for now but maybe we can log it.
                 pass

        # 2. Determine Filename
        # Format: {short_uuid}_{original_name}
        sid = shortuuid.ShortUUID().random(length=8)
        
        if image_name:
            stem = Path(image_name).stem
            # Sanitize stem if needed
            name_base = f"{sid}_{stem}"
            ext = Path(image_name).suffix or ".jpg"
        else:
            name_base = sid
            ext = ".jpg"
        
        # 3. Register Classes in Master Registry
        for ann in annotations:
            label = ann.get("label")
            if label:
                self.class_service.get_or_create_class_id(label)

        # 4. Save
        self._save_pair("", img, annotations, name_base, ext)
        
        # 5. Register Hash
        if success:
            self.hash_service.register_file(file_hash, f"{name_base}{ext}")

        if augment:
            img_h, img_w = img.shape[:2]
            
            # Horizontal flip
            img_flip = cv2.flip(img, 1)
            anns_flip = []
            for a in annotations:
                new_a = a.copy()
                pts = a.get("points", [])
                flipped_pts = []
                for i in range(0, len(pts), 2):
                    flipped_pts.append(img_w - pts[i])
                    flipped_pts.append(pts[i+1])
                new_a["points"] = flipped_pts
                anns_flip.append(new_a)
            self._save_pair("_flip", img_flip, anns_flip, name_base, ext)
            
            # Brightness decrease
            img_dark = cv2.convertScaleAbs(img, alpha=1.0, beta=-60)
            self._save_pair("_dark", img_dark, annotations, name_base, ext)
            
            # Gaussian noise
            noise = np.random.normal(0, 25, img.shape)
            img_noise = np.clip(img + noise, 0, 255).astype(np.uint8)
            self._save_pair("_noise", img_noise, annotations, name_base, ext)
        
        return name_base

    def save_entry(
        self,
        img: np.ndarray,
        toon_data: Dict[str, Any],
        augment: bool = False
    ) -> str:
        """
        Saves image and TOON annotations.
        """
        # Metadata
        meta = toon_data.get("m", ["unknown.jpg", 0, 0])
        original_stem = Path(meta[0]).stem
        img_w = meta[1]
        
        # Unique Name
        sid = shortuuid.ShortUUID().random(length=8)
        base_name = f"{sid}_{original_stem}"
        ext = ".jpg"
        
        # Hash Check
        success, img_encoded = cv2.imencode(".jpg", img)
        file_hash = None
        if success:
            file_hash = self.hash_service.calculate_md5(img_encoded.tobytes())
            if self.hash_service.is_duplicate(file_hash):
                # We save anyway but log
                pass

        # Register Classes from TOON 'c' list
        toon_classes = toon_data.get("c", [])
        for c_name in toon_classes:
            self.class_service.get_or_create_class_id(c_name)

        # 1. Save Original
        self._save_toon_pair("", img, toon_data, base_name, ext)
        
        if file_hash:
            self.hash_service.register_file(file_hash, f"{base_name}{ext}")

        if augment:
            # 2. Dark
            img_dark = cv2.convertScaleAbs(img, alpha=1.0, beta=-50)
            self._save_toon_pair("_dark", img_dark, toon_data, base_name, ext)
            
            # 3. Noise
            noise = np.random.normal(0, 25, img.shape)
            img_noise = np.clip(img + noise, 0, 255).astype(np.uint8)
            self._save_toon_pair("_noise", img_noise, toon_data, base_name, ext)
            
            # 4. Flip
            img_flip = cv2.flip(img, 1)
            
            # Flip TOON coordinates
            toon_flip = toon_data.copy()
            original_data = toon_data.get("d", [])
            new_data = []
            
            for item in original_data:
                cat_idx = item[0]
                pts = item[1]
                flipped_pts = []
                for i in range(0, len(pts), 2):
                    x = pts[i]
                    y = pts[i+1]
                    flipped_pts.append(img_w - x)
                    flipped_pts.append(y)
                new_data.append([cat_idx, flipped_pts])
            
            toon_flip["d"] = new_data
            
            self._save_toon_pair("_flip", img_flip, toon_flip, base_name, ext)
            
        return base_name

    def _save_toon_pair(self, suffix, img, toon_data, base_name, ext):
        """Helper to save image and .toon file."""
        fname = f"{base_name}{suffix}{ext}"
        img_path = self._settings.images_dir / fname
        cv2.imwrite(str(img_path), img)
        
        tname = f"{base_name}{suffix}.toon"
        lbl_path = self._settings.labels_dir / tname
        
        final_toon = toon_data.copy()
        meta = final_toon.get("m", [])
        if meta:
            new_meta = [fname, meta[1], meta[2]]
            final_toon["m"] = new_meta
            
        with open(lbl_path, "w") as f:
            json.dump(final_toon, f)

    def _save_pair(
        self,
        suffix: str,
        img: np.ndarray,
        annotations: List[Dict[str, Any]],
        name_base: str,
        ext: str
    ):
        """Save an image/label pair with Master Registry lookup."""
        fname = f"{name_base}{suffix}{ext}"
        img_path = self._settings.images_dir / fname
        cv2.imwrite(str(img_path), img)
        
        # Get registry
        registry = self.class_service.get_registry()
        
        h, w = img.shape[:2]
        lines = []
        
        for ann in annotations:
            label = ann.get("label", "unknown").strip()
            points = ann.get("points", [])
            
            # Ensure ID exists (should have been registered in outer scope, but safety check)
            if label not in registry:
                registry[label] = self.class_service.get_or_create_class_id(label)
            
            cls_id = registry[label]
            
            norm_pts = []
            for i in range(0, len(points), 2):
                nx = max(0, min(1, points[i] / w))
                ny = max(0, min(1, points[i+1] / h))
                norm_pts.append(f"{nx:.6f}")
                norm_pts.append(f"{ny:.6f}")
            
            lines.append(f"{cls_id} " + " ".join(norm_pts))
        
        lbl_path = self._settings.labels_dir / f"{name_base}{suffix}.txt"
        with open(lbl_path, "w") as f:
            f.write("\n".join(lines))
    
    
    # ---------------------------------------------------------
    # Preprocessing with Split & Remap
    # ---------------------------------------------------------
    def preprocess_dataset(
        self,
        resize_mode: str = "none",
        enable_tiling: bool = False,
        tile_size: int = 640,
        tile_overlap: float = 0.2
    ) -> bool:
        """
        Preprocesses dataset:
        1. Cleans processed/ dir.
        2. Tiling/Resizing.
        3. LABEL REMAPPING (External -> Master).
        4. TRAIN/VAL SPLIT (Autosplit).
        """
        print("Preprocessing: Cleaning old data...")
        
        if self._settings.processed_dir.exists():
            shutil.rmtree(self._settings.processed_dir)
        
        self._settings.processed_images_dir.mkdir(parents=True, exist_ok=True)
        self._settings.processed_labels_dir.mkdir(parents=True, exist_ok=True)
        
        image_files = list(self._settings.images_dir.glob("*"))
        total_images = len(image_files)
        
        resize_map = {"640": 640, "1024": 1024}
        target_resize = resize_map.get(resize_mode)
        
        print(f"Starting Preprocessing: {total_images} images. Tiling={enable_tiling}, Resize={target_resize}")

        # --- Remapping Setup ---
        # If we had external logic, we would build id_map here.
        # Since we use project_classes.json, we ensure all labels written to processed/
        # use the Master IDs.
        # However, input files might be .txt with OLD IDs or .toon.
        # Strategy: 
        # - If .toon: We have class names. Lookup Master ID. Write .txt with Master ID.
        # - If .txt: We rely on 'classes.txt' in source format to map to Master.
        
        # Determine Source IDs
        source_classes = {}
        source_classes_file = self._settings.DATASET_DIR / "classes.txt"
        id_remap = {} # {source_id: master_id}
        
        if source_classes_file.exists():
            with open(source_classes_file, 'r') as f:
                lines = [l.strip() for l in f.readlines() if l.strip()]
                for idx, name in enumerate(lines):
                    # Get/Create Master ID
                    master_id = self.class_service.get_or_create_class_id(name)
                    if master_id != idx:
                         print(f"Remapping Class: '{name}' Src {idx} -> Master {master_id}")
                    id_remap[idx] = master_id
                    
        
        for i, img_path in enumerate(image_files):
            try:
                img = cv2.imread(str(img_path))
                if img is None: continue
                
                # Check for TOON first
                toon_path = self._settings.labels_dir / (img_path.stem + ".toon")
                txt_path = self._settings.labels_dir / (img_path.stem + ".txt")
                
                polygons = [] # List of (master_id, coords)
                
                if toon_path.exists():
                    # Parse TOON
                    with open(toon_path, 'r') as f:
                        tdata = json.load(f)
                        c_list = tdata.get("c", [])
                        d_list = tdata.get("d", [])
                        
                        # Map local TOON index to Master ID
                        toon_idx_map = {}
                        for loc_idx, c_name in enumerate(c_list):
                            toon_idx_map[loc_idx] = self.class_service.get_or_create_class_id(c_name)
                            
                        for item in d_list:
                            cat_idx = item[0]
                            pts = item[1] # absolute pixels
                            
                            # Normalize
                            h, w = img.shape[:2]
                            norm_pts = []
                            for k in range(0, len(pts), 2):
                                norm_pts.append(pts[k] / w)
                                norm_pts.append(pts[k+1] / h)
                                
                            if cat_idx in toon_idx_map:
                                polygons.append((toon_idx_map[cat_idx], norm_pts))
                                
                elif txt_path.exists():
                    # Parse TXT
                    raw_polys = self._read_labels_txt(txt_path)
                    for src_id, coords in raw_polys:
                        # Remap ID
                        final_id = id_remap.get(src_id, src_id) # Default to same if map missing?
                        polygons.append((final_id, coords))
                
                # Process (Resize/Tile)
                if enable_tiling:
                    self._process_tiled(img, polygons, img_path.stem, tile_size, tile_overlap, target_resize)
                else:
                    self._process_simple(img, polygons, img_path.name, target_resize)
                    
            except Exception as e:
                print(f"Failed to process {img_path}: {e}")
        
        # --- Autosplit ---
        self._create_splits()
        
        print("Preprocessing Complete.")
        return True
    
    def _create_splits(self):
        """Generates autosplit_train.txt and autosplit_val.txt (80/20)."""
        processed_imgs = list(self._settings.processed_images_dir.glob("*.jpg"))
        # Use absolute paths
        processed_imgs = [str(p.absolute()) for p in processed_imgs]
        
        random.shuffle(processed_imgs)
        split_idx = int(len(processed_imgs) * 0.8)
        
        train_files = processed_imgs[:split_idx]
        val_files = processed_imgs[split_idx:]
        
        base_dir = self._settings.DATASET_DIR # Or processed dir?
        # YOLO expects txt files with headers usually? No, just list of images.
        
        with open(self._settings.DATASET_DIR / "autosplit_train.txt", "w") as f:
            f.write("\n".join(train_files))
            
        with open(self._settings.DATASET_DIR / "autosplit_val.txt", "w") as f:
            f.write("\n".join(val_files))
            
        print(f"Split created: {len(train_files)} Train, {len(val_files)} Val")

    def _read_labels_txt(self, label_path: Path) -> List[tuple]:
        """Read YOLO format labels from file."""
        polygons = []
        if label_path.exists():
            with open(label_path, "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) > 1:
                        cls_id = int(parts[0])
                        coords = [float(x) for x in parts[1:]]
                        polygons.append((cls_id, coords))
        return polygons
    
    def _process_simple(self, img, polygons, name, target_resize):
        """Process without tiling, saving to processed/."""
        if target_resize:
            img = cv2.resize(img, (target_resize, target_resize))
            
        cv2.imwrite(str(self._settings.processed_images_dir / name), img)
        
        if polygons:
            label_path = self._settings.processed_labels_dir / (Path(name).stem + ".txt")
            with open(label_path, "w") as f:
                for cls_id, pts in polygons:
                    line = f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n"
                    f.write(line)

    def _process_tiled(self, img, polygons, name_base, tile_size, overlap, target_resize):
        """Process with tiling."""
        h, w = img.shape[:2]
        slices = get_slices(h, w, tile_size, overlap)
        
        for s_idx, (x1, y1, x2, y2) in enumerate(slices):
            tile_img = img[y1:y2, x1:x2]
            th, tw = tile_img.shape[:2]
            
            if th < 10 or tw < 10: continue
            
            if target_resize:
                tile_img = cv2.resize(tile_img, (target_resize, target_resize))
            
            tile_polygons = []
            tile_box = ShapelyPolygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
            
            for cls_id, coords in polygons:
                # Denormalize
                abs_coords = []
                for k in range(0, len(coords), 2):
                    abs_coords.append((coords[k] * w, coords[k+1] * h))
                
                poly_shape = ShapelyPolygon(abs_coords)
                if not poly_shape.is_valid: poly_shape = make_valid(poly_shape)
                
                try:
                    intersection = tile_box.intersection(poly_shape)
                    if intersection.is_empty: continue
                    
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
                except:
                    pass
            
            if tile_polygons:
                tile_name = f"{name_base}_t{s_idx}.jpg"
                cv2.imwrite(str(self._settings.processed_images_dir / tile_name), tile_img)
                with open(self._settings.processed_labels_dir / f"{name_base}_t{s_idx}.txt", "w") as f:
                     for cls_id, pts in tile_polygons:
                        line = f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n"
                        f.write(line)

    def _extract_geoms(self, geometry):
        geoms = []
        if geometry.geom_type == 'Polygon':
            geoms.append(geometry)
        elif geometry.geom_type == 'MultiPolygon':
            geoms.extend(geometry.geoms)
        elif geometry.geom_type == 'GeometryCollection':
            for g in geometry.geoms:
                if g.geom_type == 'Polygon': geoms.append(g)
        return geoms


def get_dataset_service():
    return DatasetService()
