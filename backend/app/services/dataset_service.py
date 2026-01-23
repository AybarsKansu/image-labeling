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

from shapely.geometry import Polygon as ShapelyPolygon
from shapely.validation import make_valid


class DatasetService:
    """Handles dataset operations including saving and preprocessing."""
    
    def __init__(self):
        self._settings = get_settings()
        self._ensure_directories()
    
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
        
        Args:
            img: OpenCV image
            annotations: List of annotation dicts with 'label' and 'points'
            image_name: Optional filename
            augment: Whether to create augmented copies
            
        Returns:
            Base name of saved files
        """
        # Determine filename
        if image_name:
            name_base = Path(image_name).stem
            ext = Path(image_name).suffix or ".jpg"
        else:
            name_base = str(uuid.uuid4())
            ext = ".jpg"
        
        # Save original
        self._save_pair("", img, annotations, name_base, ext)
        
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
        Saves image and TOON annotations to dataset/images and dataset/labels.
        Includes augmentation: flip, dark, noise.
        """
        # Metadata
        meta = toon_data.get("m", ["unknown.jpg", 0, 0])
        original_name = Path(meta[0]).stem
        img_w = meta[1]
        
        base_name = original_name
        ext = ".jpg"
        
        # 1. Save Original
        self._save_toon_pair("", img, toon_data, base_name, ext)
        
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
            # Deep copy data array
            original_data = toon_data.get("d", [])
            new_data = []
            
            for item in original_data:
                # item is [cat_idx, [pts]]
                cat_idx = item[0]
                pts = item[1]
                flipped_pts = []
                for i in range(0, len(pts), 2):
                    x = pts[i]
                    y = pts[i+1]
                    flipped_pts.append(img_w - x) # Flip X
                    flipped_pts.append(y)         # Keep Y
                new_data.append([cat_idx, flipped_pts])
            
            toon_flip["d"] = new_data
            
            self._save_toon_pair("_flip", img_flip, toon_flip, base_name, ext)
            
        return base_name

    def _save_toon_pair(self, suffix, img, toon_data, base_name, ext):
        """Helper to save image and .toon file."""
        # Save Image
        fname = f"{base_name}{suffix}{ext}"
        img_path = self._settings.images_dir / fname
        cv2.imwrite(str(img_path), img)
        
        # Save TOON
        import json
        tname = f"{base_name}{suffix}.toon"
        lbl_path = self._settings.labels_dir / tname
        
        # Update filename in metadata for consistency
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
        """Save an image/label pair."""
        fname = f"{name_base}{suffix}{ext}"
        img_path = self._settings.images_dir / fname
        cv2.imwrite(str(img_path), img)
        
        # Get/update class mapping
        class_map = self._load_class_map()
        
        # Generate YOLO format labels
        h, w = img.shape[:2]
        lines = []
        
        for ann in annotations:
            label = ann.get("label", "unknown").strip()
            points = ann.get("points", [])
            
            if label not in class_map:
                class_map[label] = len(class_map)
                self._append_class(label)
            
            cls_id = class_map[label]
            
            # Normalize points
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
    
    def _load_class_map(self) -> Dict[str, int]:
        """Load class name to ID mapping from classes.txt."""
        classes_file = self._settings.DATASET_DIR / "classes.txt"
        if not classes_file.exists():
            classes_file.touch()
            return {}
        
        with open(classes_file, "r") as f:
            classes = [l.strip() for l in f.readlines() if l.strip()]
        
        return {name: i for i, name in enumerate(classes)}
    
    def _append_class(self, label: str):
        """Append a new class to classes.txt."""
        classes_file = self._settings.DATASET_DIR / "classes.txt"
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


def get_dataset_service():
    """FastAPI dependency for DatasetService."""
    return DatasetService()
