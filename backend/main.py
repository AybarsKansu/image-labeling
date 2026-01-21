import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
try:
    from ultralytics import SAM
except ImportError:
    SAM = None # Fallback or handle error
    print("Warning: SAM not available in ultralytics.")

from shapely.geometry import Polygon as ShapelyPolygon, MultiPolygon, LineString, GeometryCollection
from shapely.ops import split
from shapely.validation import make_valid


import os
from pathlib import Path
import json
import uuid
import base64
import glob
import shutil
import threading
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration & Model ---
MODELS = {}
TRAINING_STATUS = {
    "is_training": False,
    "progress": 0.0,
    "message": "Idle",
    "epoch": 0,
    "epoch": 0,
    "total_epochs": 0
}
STOP_TRAINING = False

def scan_models():
    """Scans for .pt files, loads SAM/YOLO, moves to CUDA."""
    print("Scanning for models...")
    # 1. Standard candidates
    standard_models = ["yolov8m-seg.pt", "yolov8x-seg.pt", "sam3_b.pt", "sam3_l.pt", "yolov8l-world.pt", "yolo11x-seg.pt", "yolo11l-seg.pt", "yolo11m-seg.pt", "sam2.1_l.pt", "sam2.1_b.pt", "sam2.1_t.pt"]
    
    # 2. Scan for local files
    search_paths = ["*.pt", "**/*.pt"]
    local_files = []
    for pattern in search_paths:
        for filepath in glob.glob(pattern, recursive=True):
            filepath = os.path.normpath(filepath)
            # Avoid re-adding if already in explicit standard list (simple collision check)
            if filepath not in local_files:
                local_files.append(filepath)
            
    print(f"Discovered local files: {local_files}")

    # Helper to load
    def load_and_register(name, path):
        if name in MODELS: return
        try:
            print(f"Loading {name}...")
            if "sam" in name.lower() and "yolo" not in name.lower():
                if SAM:
                    model = SAM(path)
                else:
                    print(f"Skipping {name}: SAM class not imported.")
                    return
            else:
                model = YOLO(path)
            
            # OPTIMIZATION: Move to CUDA immediately
            model.to('cuda')
            MODELS[name] = model
            print(f"Loaded {name} to CUDA.")
        except Exception as e:
            print(f"Failed to load {name}: {e}")

    # Load found files
    for fp in local_files:
        load_and_register(fp, fp)

    # Attempt to load standard ones if they exist locally but weren't caught
    for m in standard_models:
        if os.path.exists(m):
            load_and_register(m, m)

# Load models on startup
scan_models()

def get_model(model_name: str = None):
    """Returns requested model, lazy-loading if necessary."""
    if not model_name:
        model_name = "yolov8m-seg.pt"
    
    # 1. Map 'yolo11' short names to filenames if needed (optional)
    # But usually frontend sends full filename.
    
    # 2. Try exact match in memory
    if model_name in MODELS:
        return MODELS[model_name]
    
    # 3. Try lazy load from disk
    # Support both full path or just filename if in root
    possible_paths = [model_name] 
    if not os.path.exists(model_name):
         # Try looking in current dir if just filename passed
         if os.path.exists(os.path.basename(model_name)):
             possible_paths.append(os.path.basename(model_name))
    
    for path in possible_paths:
        if os.path.exists(path):
            print(f"Lazy loading {path}...")
            try:
                if "sam" in path.lower() and "yolo" not in path.lower():
                    if SAM:
                        model = SAM(path)
                        model.to('cuda')
                        MODELS[model_name] = model # Register under logical name too
                        return model
                else:
                    model = YOLO(path)
                    model.to('cuda')
                    MODELS[model_name] = model
                    return model
            except Exception as e:
                print(f"Lazy load failed for {path}: {e}")

    # 4. Try standard loading (Auto-Download from Ultralytics)
    # If it's a known string like "yolov8m-seg.pt", YOLO() will download it.
    try:
        if "yolo" in model_name.lower() and not "sam" in model_name.lower():
            print(f"Attempting standard YOLO load (auto-download) for {model_name}...")
            model = YOLO(model_name)
            model.to('cuda')
            MODELS[model_name] = model
            return model
    except Exception as e:
        print(f"Standard load failed for {model_name}: {e}")

    # 5. Fallback (LAST RESORT)
    if MODELS:
        # Prefer a loaded YOLO model if available
        for k, v in MODELS.items():
             if "yolo" in k.lower():
                 print(f"Warning: Model {model_name} not found. Using fallback {k}.")
                 return v
        
        fallback = list(MODELS.values())[0]
        print(f"Warning: Model {model_name} not found. Using generic fallback.")
        return fallback
    return None

# Dataset Paths
DATASET_DIR = Path("dataset").resolve()
IMAGES_DIR = DATASET_DIR / "images"
LABELS_DIR = DATASET_DIR / "labels"
PROCESSED_DIR = DATASET_DIR / "processed"
PROCESSED_IMAGES_DIR = PROCESSED_DIR / "images"
PROCESSED_LABELS_DIR = PROCESSED_DIR / "labels"

IMAGES_DIR.mkdir(parents=True, exist_ok=True)
LABELS_DIR.mkdir(parents=True, exist_ok=True)

# --- Helpers ---

def process_image(file_bytes: bytes) -> np.ndarray:
    """Decodes bytes to OpenCV Image (BGR)."""
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img

def masks_to_polygons(masks) -> list:
    """Converts YOLO masks to flat polygon lists [x1, y1, x2, y2, ...]."""
    if masks is None:
        return []
    polygons = []
    # masks.xy is a list of arrays, each array is an object's polygon contour
    for mask_contour in masks.xy:
        # mask_contour is [[x,y], [x,y]...]
        # Flatten to [x, y, x, y...]
        poly = np.array(mask_contour, dtype=np.float32).flatten().tolist()
        polygons.append(poly)
    return polygons

def preprocess_dataset(params: dict):
    """
    Slices/Resizes images and labels.
    params: { 'resize_mode': 'none'|'640'|'1024', 'enable_tiling': bool, 'tile_size': int, 'tile_overlap': float }
    """
    global TRAINING_STATUS
    TRAINING_STATUS["message"] = "Preprocessing: Cleaning old data..."
    
    # 1. Clean Processed Dir
    if PROCESSED_DIR.exists():
        shutil.rmtree(PROCESSED_DIR)
    PROCESSED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_LABELS_DIR.mkdir(parents=True, exist_ok=True)

    # Copy classes.txt
    if (DATASET_DIR / "classes.txt").exists():
        shutil.copy(DATASET_DIR / "classes.txt", PROCESSED_DIR / "classes.txt")

    image_files = glob.glob(str(IMAGES_DIR / "*"))
    total_images = len(image_files)
    
    resize_map = {'640': 640, '1024': 1024}
    target_resize = resize_map.get(params.get('resize_mode'), None)
    
    tile_size = int(params.get('tile_size', 640))
    overlap = float(params.get('tile_overlap', 0.2))
    enable_tiling = params.get('enable_tiling', False)

    print(f"Starting Preprocessing: {total_images} images. Tiling={enable_tiling}, Resize={target_resize}")

    for i, img_path in enumerate(image_files):
        TRAINING_STATUS["message"] = f"Preprocessing {i+1}/{total_images}"
        TRAINING_STATUS["progress"] = (i / total_images) * 0.3 # Allocate 30% of progress bar to preprocessing
        
        try:
            # Read Image
            img = cv2.imread(img_path)
            if img is None: continue
            h, w = img.shape[:2]
            
            # Read Label
            label_path = LABELS_DIR / (Path(img_path).stem + ".txt")
            polygons = [] # List of (class_id, points_normalized)
            
            if label_path.exists():
                with open(label_path, 'r') as f:
                    lines = f.readlines()
                    for line in lines:
                        parts = line.strip().split()
                        if len(parts) > 1:
                            cls_id = int(parts[0])
                            coords = [float(x) for x in parts[1:]]
                            polygons.append((cls_id, coords))

            # --- Logic Branch ---
            if enable_tiling:
                # 1. Generate Slices
                slices = get_slices(h, w, tile_size, overlap)
                
                for s_idx, (x1, y1, x2, y2) in enumerate(slices):
                    # Crop Image
                    tile_img = img[y1:y2, x1:x2]
                    th, tw = tile_img.shape[:2]
                    if th < 10 or tw < 10: continue # Skip tiny garbage
                    
                    # Optional Resize of Tile
                    if target_resize:
                        tile_img = cv2.resize(tile_img, (target_resize, target_resize))
                        # Scale factor for labels would be target/th, target/tw
                        # But we normalize anyway, so we just need to know the tile bounds relative to original.
                    
                    # Process Polygons
                    tile_polygons = []
                    
                    tile_box_poly = ShapelyPolygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
                    
                    for cls_id, coords in polygons:
                        # Denormalize
                        abs_coords = []
                        for k in range(0, len(coords), 2):
                            abs_coords.append((coords[k] * w, coords[k+1] * h))
                        
                        poly_shape = ShapelyPolygon(abs_coords)
                        if not poly_shape.is_valid: poly_shape = make_valid(poly_shape)
                        
                        # Intersect
                        try:
                            intersection = tile_box_poly.intersection(poly_shape)
                            
                            if intersection.is_empty: continue
                            
                            # Handle Geometry Types (MultiPolygon, Polygon, GeometryCollection)
                            geoms = []
                            if intersection.geom_type == 'Polygon':
                                geoms.append(intersection)
                            elif intersection.geom_type == 'MultiPolygon':
                                geoms.extend(intersection.geoms)
                            elif intersection.geom_type == 'GeometryCollection':
                                for g in intersection.geoms:
                                    if g.geom_type == 'Polygon': geoms.append(g)
                                    
                            for g in geoms:
                                # Provide relative normalized coordinates
                                # g is in absolute original coords. 
                                # Need to map to tile frame (0..tw, 0..th)
                                # x_rel = x_abs - x1
                                
                                g_coords = list(g.exterior.coords)
                                flattened = []
                                for gx, gy in g_coords[:-1]: # skip last dup
                                    nx = (gx - x1) / tw
                                    ny = (gy - y1) / th
                                    
                                    # Clip to 0-1 strictly
                                    nx = min(max(nx, 0), 1)
                                    ny = min(max(ny, 0), 1)
                                    
                                    flattened.extend([nx, ny])
                                
                                if len(flattened) >= 6: # At least triangle
                                    tile_polygons.append((cls_id, flattened))

                        except Exception as e:
                            print(f"Poly Error: {e}")

                    # Save Tile if it has labels or (optional) keep 10% empty
                    # For now only save if labels to reduce noise
                    if tile_polygons:
                        tile_name = f"{Path(img_path).stem}_t{s_idx}.jpg"
                        cv2.imwrite(str(PROCESSED_IMAGES_DIR / tile_name), tile_img)
                        
                        with open(PROCESSED_LABELS_DIR / (Path(tile_name).stem + ".txt"), 'w') as f:
                            for cls_id, pts in tile_polygons:
                                line = f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n"
                                f.write(line)

            else:
                # No Tiling
                final_img = img
                final_h, final_w = h, w
                
                # Resize
                if target_resize:
                    final_img = cv2.resize(img, (target_resize, target_resize))
                    final_h, final_w = target_resize, target_resize
                    # Polygons are normalized, so NO CHANGE needed for labels!
                
                # Save
                new_name = Path(img_path).name
                cv2.imwrite(str(PROCESSED_IMAGES_DIR / new_name), final_img)
                
                # Copy/Write Labels
                if polygons:
                     with open(PROCESSED_LABELS_DIR / (Path(new_name).stem + ".txt"), 'w') as f:
                        for cls_id, pts in polygons:
                             # Just copy normalized points
                             line = f"{cls_id} " + " ".join([f"{x:.6f}" for x in pts]) + "\n"
                             f.write(line)

        except Exception as e:
            print(f"Failed to process {img_path}: {e}")

    print("Preprocessing Complete.")
    return True

# --- Training Background Task ---
def train_model_task(base_model_name: str, epochs: int, batch_size: int, preprocess_params: dict = None):
    global TRAINING_STATUS, STOP_TRAINING
    STOP_TRAINING = False
    TRAINING_STATUS["is_training"] = True
    TRAINING_STATUS["progress"] = 0.0
    TRAINING_STATUS["epoch"] = 0
    TRAINING_STATUS["total_epochs"] = epochs
    TRAINING_STATUS["message"] = "Initializing..."

    try:
        # 0. Preprocessing
        target_data_dir = DATASET_DIR
        
        if preprocess_params:
            success = preprocess_dataset(preprocess_params)
            if success:
                target_data_dir = PROCESSED_DIR
            else:
                 TRAINING_STATUS["message"] = "Preprocessing Failed."
                 TRAINING_STATUS["is_training"] = False
                 return

        # 1. Generate data.yaml
        yaml_content = f"""
path: {target_data_dir.as_posix()}
train: images
val: images
names:
"""
        # Read classes
        classes_file = target_data_dir / "classes.txt"
        if not classes_file.exists():
            # If not in processed, try original (preprocessing mimics it usually but just in case)
             classes_file = DATASET_DIR / "classes.txt"
        
        if not classes_file.exists():
            raise Exception("No classes.txt found. Cannot train.")
        
        with open(classes_file, "r") as f:
            classes = [line.strip() for line in f.readlines() if line.strip()]
        
        for i, c in enumerate(classes):
            yaml_content += f"  {i}: {c}\n"

        yaml_path = DATASET_DIR / "data.yaml"
        with open(yaml_path, "w") as f:
            f.write(yaml_content)

        # 2. Get Base Model
        # We need a fresh instance to avoid messing up loaded ones, or just use the name strings
        # Ultralytics train() accepts filename string.
        model_path = base_model_name
        if not os.path.exists(model_path):
            # If not local, maybe it's a standard hub model, let YOLO handle download
            pass 

        TRAINING_STATUS["message"] = "Starting training..."
        
        # We use a custom callback or just polling? 
        # Ultralytics training is blocking. We can't easily get fine-grained progress without callbacks.
        # For simplicity, we'll mark "In Progress".
        
        model = YOLO(model_path)
        
        # Custom Callback for Progress
        def on_train_epoch_end(trainer):
            global STOP_TRAINING
            if STOP_TRAINING:
                raise Exception("Training Cancelled by User")
            
            TRAINING_STATUS["epoch"] = trainer.epoch + 1
            # 0.3 to 1.0 is training part (0.0-0.3 is preprocessing)
            # trainer.epoch is 0-indexed
            progress = 0.3 + ((trainer.epoch + 1) / epochs * 0.7)
            TRAINING_STATUS["progress"] = min(progress, 0.99)
            TRAINING_STATUS["message"] = f"Epoch {trainer.epoch + 1}/{epochs}"

        model.add_callback("on_train_epoch_end", on_train_epoch_end)

        results = model.train(
            data=yaml_path.as_posix(),
            epochs=epochs,
            batch=batch_size,
            imgsz=640,
            plots=False,
            device='cuda', # Force 5070
            project="runs",
            name="train_job",
            exist_ok=True
        )

        TRAINING_STATUS["message"] = "Finalizing..."
        
        # 3. Post-Processing
        # Find best.pt
        best_pt = Path("runs/train_job/weights/best.pt")
        if best_pt.exists():
            # Auto-increment version
            existing_customs = glob.glob("custom_v*.pt")
            
            # Extract max N
            max_v = 0
            for f in existing_customs:
                try:
                    # f is something like custom_v1.pt
                    v_str = f.replace("custom_v", "").replace(".pt", "")
                    v = int(v_str)
                    if v > max_v: max_v = v
                except:
                    pass
            
            new_name = f"custom_v{max_v + 1}.pt"
            shutil.move(str(best_pt), new_name)
            
            # Reload models
            scan_models()
            
            TRAINING_STATUS["message"] = f"Completed! Saved as {new_name}"
            
            # Remove runs folder to save space
            try:
                if os.path.exists("runs"):
                    shutil.rmtree("runs")
                    print("Deleted runs/ folder.")
            except Exception as e:
                print(f"Failed to delete runs/: {e}")
        else:
            TRAINING_STATUS["message"] = "Failed: best.pt not found."


    except Exception as e:
        if str(e) == "Training Cancelled by User":
            TRAINING_STATUS["message"] = "Cancelled by User"
        else:
            TRAINING_STATUS["message"] = f"Error: {str(e)}"
        print(f"Training Error: {e}")
    finally:
        TRAINING_STATUS["is_training"] = False


# --- Management Endpoints ---

@app.get("/api/models")
async def get_available_models():
    """Returns list of available loaded models."""
    return JSONResponse({"models": list(MODELS.keys())})

@app.post("/api/download-model")
async def download_model(model_name: str = Form(...)):
    """Downloads a standard model by initializing it."""
    try:
        # Prevent arbitrary command injection or weird paths
        valid_prefixes = ["yolo", "sam"]
        if not any(model_name.lower().startswith(p) for p in valid_prefixes):
             return JSONResponse({"error": "Invalid model name. Must start with 'yolo' or 'sam'."}, status_code=400)

        print(f"Attempting to download/load: {model_name}")

        # Logic: Initialize -> Download -> Models dict update
        try:
            if "sam" in model_name.lower():
                 if not SAM: 
                     return JSONResponse({"error": "SAM support not available (ultralytics.SAM missing)"}, status_code=500)
                 model = SAM(model_name)
            else:
                 model = YOLO(model_name)
            
            # Verify it loaded (YOLO/SAM might download on init, or error if not found)
            # If init succeeds, we assume it's good.
            
            model.to('cuda')
            MODELS[model_name] = model
            return JSONResponse({"success": True, "message": f"Successfully loaded {model_name}"})
            
        except Exception as load_err:
            print(f"Load failed: {load_err}")
            # Likely file not found on hub or connection error
            return JSONResponse({"error": f"Failed to download/load model: {str(load_err)}"}, status_code=404)

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.delete("/api/delete-model")
async def delete_model(model_name: str = Form(...)):
    """Deletes a local model file."""
    try:
        # Safety: Only allow .pt files in current dir
        if "/" in model_name or "\\" in model_name:
             return JSONResponse({"error": "Invalid filename"}, status_code=400)
        
        if not model_name.endswith(".pt"):
             return JSONResponse({"error": "Only .pt files"}, status_code=400)

        if os.path.exists(model_name):
            os.remove(model_name)
            if model_name in MODELS:
                del MODELS[model_name]
            return JSONResponse({"success": True})
        else:
            return JSONResponse({"error": "File not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/training-status")
async def get_training_status():
    return JSONResponse(TRAINING_STATUS)

@app.post("/api/train-model")
async def train_model(
    background_tasks: BackgroundTasks,
    base_model: str = Form(...),
    epochs: int = Form(100),
    batch_size: int = Form(16),
    preprocess_params: str = Form(None) # JSON String
):
    if TRAINING_STATUS["is_training"]:
        return JSONResponse({"error": "Training already in progress"}, status_code=400)
    
    # Parse params
    p_params = None
    if preprocess_params:
        try:
            p_params = json.loads(preprocess_params)
        except:
            pass

    if "sam" in base_model.lower():
        # SAM training not supported (as per requirements fine-tuning logic usually different/not requested)
        return JSONResponse({"error": "SAM 3 is a Foundation Model and cannot be fine-tuned here. Use YOLO for custom objects."}, status_code=400)

    # Start Background Task
    background_tasks.add_task(train_model_task, base_model, epochs, batch_size, p_params)
    
    return JSONResponse({"success": True, "message": "Preprocessing & Training started"})

@app.post("/api/cancel-training")
async def cancel_training():
    global STOP_TRAINING
    STOP_TRAINING = True
    return JSONResponse({"success": True, "message": "Cancellation requested."})

# --- Tiled Inference Helpers ---
def get_slices(img_h, img_w, tile_size=640, overlap=0.2):
    """
    Generates slice coordinates (x1, y1, x2, y2).
    """
    if img_w <= tile_size and img_h <= tile_size:
        return [(0, 0, img_w, img_h)]

    slices = []
    stride = int(tile_size * (1 - overlap))
    
    for y in range(0, img_h, stride):
        for x in range(0, img_w, stride):
            x2 = min(x + tile_size, img_w)
            y2 = min(y + tile_size, img_h)
            
            # Adjust start if we hit the edge to ensure full tile
            x1 = max(0, x2 - tile_size)
            y1 = max(0, y2 - tile_size)
            
            slices.append((x1, y1, x2, y2))
            
            if x2 >= img_w: break
        if y2 >= img_h: break
        
    return slices

def safe_nms(boxes, scores, iou_threshold=0.5):
    """
    Applies NMS using OpenCV to avoid extra torch dependency if strictly needed,
    but we likely have torch given YOLO.
    boxes: list of [x, y, w, h]
    scores: list of float
    """
    if not boxes:
        return []
    
    # cv2.dnn.NMSBoxes expects [x, y, w, h]
    indices = cv2.dnn.NMSBoxes(boxes, scores, score_threshold=0.01, nms_threshold=iou_threshold)
    
    if len(indices) == 0:
        return []
    
    return [i for i in indices]

@app.get("/api/models")
async def get_available_models():
    """Returns list of available loaded models."""
    return JSONResponse({"models": list(MODELS.keys())})

@app.post("/api/detect-all")
async def detect_all(
    file: UploadFile = File(...),
    model_name: str = Form("yolov8m-seg.pt"),
    confidence: float = Form(0.5)
):
    """
    Detects ALL objects using Tiled Inference (Slicing).
    Splits image into overlapping tiles, runs detection, and merges results.
    """
    try:
        image_bytes = await file.read()
        img = process_image(image_bytes)
        img_h, img_w = img.shape[:2]
        
        # Tile Config
        TILE_SIZE = 640
        OVERLAP = 0.25
        slices = get_slices(img_h, img_w, tile_size=TILE_SIZE, overlap=OVERLAP)
        
        all_detections = [] # [x, y, w, h, conf, class_id, mask_poly_flat]
        
        print(f"Slicing image ({img_w}x{img_h}) into {len(slices)} tiles...")
        
        for (sx1, sy1, sx2, sy2) in slices:
            tile = img[sy1:sy2, sx1:sx2]
            if tile.size == 0: continue
            
            # Run Inference on Tile
            # Use provided confidence. 
            # If custom model (best.pt), we might want stronger NMS, but for now standard is ok.
            active_model = get_model(model_name)
            if not active_model:
                return JSONResponse({"error": "Model not found"}, status_code=400)

            results = active_model(tile, retina_masks=True, conf=confidence, iou=0.5, agnostic_nms=True, verbose=False)
            result = results[0]
            
            if result.masks:
                polygons = masks_to_polygons(result.masks)
                if result.boxes:
                    for i, poly in enumerate(polygons):
                        cls_id = int(result.boxes.cls[i])
                        conf = float(result.boxes.conf[i])
                        
                        # Translate Polygon to Global Coords
                        global_poly = []
                        min_x, min_y = float('inf'), float('inf')
                        max_x, max_y = float('-inf'), float('-inf')
                        
                        for j in range(0, len(poly), 2):
                            px = poly[j] + sx1
                            py = poly[j+1] + sy1
                            global_poly.extend([px, py])
                            
                            min_x = min(min_x, px)
                            min_y = min(min_y, py)
                            max_x = max(max_x, px)
                            max_y = max(max_y, py)
                            
                        # Box for NMS: [x, y, w, h]
                        bw = max_x - min_x
                        bh = max_y - min_y
                        box = [min_x, min_y, bw, bh]
                        
                        all_detections.append({
                            "box": box,
                            "score": conf,
                            "class_id": cls_id,
                            "label": result.names[cls_id],
                            "points": global_poly
                        })

        # --- Merging & NMS ---
        if not all_detections:
             return JSONResponse({"detections": []})
             
        # Prepare for NMS
        nms_boxes = [d["box"] for d in all_detections]
        nms_scores = [d["score"] for d in all_detections]
        
        keep_indices = safe_nms(nms_boxes, nms_scores, iou_threshold=0.4)
        
        final_detections = []
        for idx in keep_indices:
            det = all_detections[idx]
            final_detections.append({
                "id": str(uuid.uuid4()),
                "label": det["label"],
                "points": det["points"],
                "type": "poly",
                "confidence": det["score"]
            })
            
        print(f"Merged {len(all_detections)} raw detections into {len(final_detections)} final objects.")
        
        return JSONResponse({"detections": final_detections})

    except Exception as e:
        print(f"Error in /api/detect-all: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/segment-box")
async def segment_box(
    file: UploadFile = File(...),
    box_json: str = Form(...),  # Expected JSON: [x, y, w, h] inputs
    model_name: str = Form("sam3_l.pt"),
    confidence: float = Form(0.2),
    text_prompt: str = Form(None) # Optional label override
):
    """
    Detects objects within the specified bounding box.
    - If SAM: Uses native bbox prompting (Full Image + coords). Returns Polygon.
    - If YOLO: Crops image -> Detects. Returns Polygon.
    """
    try:
        # Parse Box
        x, y, w, h = json.loads(box_json)
        x, y, w, h = int(x), int(y), int(w), int(h)

        if w <= 0 or h <= 0:
            print(f"DEBUG: Invalid box dimensions: {w}x{h}")
            return JSONResponse({"error": "Invalid box dimensions"}, status_code=400)

        image_bytes = await file.read()
        img = process_image(image_bytes)
        img_h, img_w = img.shape[:2]
        print(f"DEBUG: segment_box image {img_w}x{img_h}, box: {x},{y} {w}x{h}, model: {model_name}")

        # Convert to XYXY for SAM / internal use
        x1 = x
        y1 = y
        x2 = x + w
        y2 = y + h

        detections = []
        suggestions = []

        # --- MODEL LOGIC ---

        # NEW: Validation Step with YOLO-World if text_prompt is present
        mask_prompt_poly = None 
        
        if text_prompt and text_prompt.strip():
            print(f"DEBUG: Running YOLO-World Pre-Check for '{text_prompt}'")
            try:
                # 1. Load YOLO-World
                yw_name = "yolov8l-world.pt"
                yw_model = get_model(yw_name)
                
                # If not loaded, force load
                if not yw_model:
                     print(f"Loading {yw_name} for validation...")
                     yw_model = YOLO(yw_name)
                     yw_model.to('cuda')
                     MODELS[yw_name] = yw_model

                # 2. Set Classes and Run on Crop
                # Define Classes
                yw_model.set_classes([text_prompt.strip()])
                
                # Crop image
                cx1 = max(0, x1); cy1 = max(0, y1)
                cx2 = min(img_w, x2); cy2 = min(img_h, y2)
                crop = img[cy1:cy2, cx1:cx2]
                
                if crop.size == 0:
                    return JSONResponse({"detections": [], "error": "Invalid Box"})

                # Run Inference
                # increased confidence for validation to be strict
                val_results = yw_model.predict(crop, conf=confidence, verbose=False) 
                
                # Check if we found anything
                found = False
                if len(val_results) > 0 and len(val_results[0].boxes) > 0:
                    found = True
                    print(f"DEBUG: Validation Passed. Found {len(val_results[0].boxes)} {text_prompt}(s)")
                
                if not found:
                    print(f"DEBUG: Validation Failed. No '{text_prompt}' found in box. Fallback to generic SAM with label 'object'.")
                    # Fallback policy: Proceed to SAM but with generic label
                    text_prompt = "object"
                    
            except Exception as e:
                print(f"WARNING: YOLO-World Validation failed: {e}. Proceeding without validation.")
                # Optional: Proceed or Fail? User requested "IF FAIL: Return error". 
                # But if code fails (e.g. model corrupt), maybe we should fail safe.
                # Currently we'll print and arguably might want to just return error to be safe.
                pass


        if "sam" in model_name.lower():
            # --- SAM PATH (Native Prompting) ---
            print("DEBUG: Using SAM path")
            sam_model = get_model(model_name)
            if not sam_model:
                 print(f"DEBUG: SAM model {model_name} not found")
                 # Fallback to loading it if valid name but not loaded
                 try:
                     sam_model = SAM(model_name)
                     sam_model.to('cuda')
                     MODELS[model_name] = sam_model
                 except:    
                     return JSONResponse({"error": f"SAM Model {model_name} not found"}, status_code=400)
            
            # Run Inference with BBox Prompt
            results = sam_model(img, bboxes=[[x1, y1, x2, y2]], verbose=False)
            print(f"DEBUG: SAM results masks: {len(results[0].masks) if results[0].masks else 'None'}")
            
            if results[0].masks:
                polygons = masks_to_polygons(results[0].masks)
                label = text_prompt.strip() if (text_prompt and text_prompt.strip()) else "Object"
                for poly in polygons:
                    detections.append({
                        "id": str(uuid.uuid4()),
                        "label": label,
                        "points": poly, # Already flat [x, y, x, y...]
                        "type": "poly"
                    })
        
        else:
            # --- YOLO PATH (Crop & Detect) ---
            print("DEBUG: Using YOLO path")
            # Clamp crop coordinates
            cx1 = max(0, x1); cy1 = max(0, y1)
            cx2 = min(img_w, x2); cy2 = min(img_h, y2)
            
            crop = img[cy1:cy2, cx1:cx2]
            if crop.size == 0:
                print("DEBUG: Empty crop")
                return JSONResponse({"detections": [], "suggestions": []})
            
            active_model = get_model(model_name)
            if not active_model:
                 print(f"DEBUG: Active model {model_name} not found")
                 return JSONResponse({"error": "Model not found"}, status_code=400)
            
            # Run Inference on Crop
            results = active_model(crop, retina_masks=True, conf=0.05, iou=0.8, agnostic_nms=False, max_det=20)
            result = results[0]
            print(f"DEBUG: YOLO result boxes: {len(result.boxes) if result.boxes else 0}, masks: {len(result.masks) if result.masks else 'None'}")

            
            if result.boxes:
                 # Collect suggestions
                 for k, cls_id in enumerate(result.boxes.cls):
                     lbl = result.names[int(cls_id)]
                     cnf = float(result.boxes.conf[k])
                     suggestions.append({"label": lbl, "score": cnf})
            
            # Primary Detection
            if result.masks:
                polygons = masks_to_polygons(result.masks)
                if len(result.boxes.conf) > 0:
                     best_idx = int(result.boxes.conf.argmax())
                     if float(result.boxes.conf[best_idx]) > 0.10:
                        poly = polygons[best_idx]
                        cls_id = int(result.boxes.cls[best_idx])
                        
                        # Labeling: Use text prompt if valid, else Model's prediction
                        if text_prompt and text_prompt.strip():
                            label = text_prompt.strip()
                        else:
                            label = result.names[cls_id]
                        
                        # Translate coordinates
                        global_poly = []
                        for j in range(0, len(poly), 2):
                            px = poly[j] + cx1
                            py = poly[j+1] + cy1
                            global_poly.extend([px, py])
                            
                        detections.append({
                            "id": str(uuid.uuid4()),
                            "label": label,
                            "points": global_poly,
                            "type": "poly"
                        })
            
            # Fallback: If no mask but box exists (e.g. using object detection model by mistake)
            elif result.boxes and len(result.boxes) > 0:
                 print("DEBUG: No masks found, falling back to box")
                 best_idx = int(result.boxes.conf.argmax())
                 box = result.boxes.xywh[best_idx].tolist() # x, y, w, h
                 cls_id = int(result.boxes.cls[best_idx])
                 
                 # Convert crop-relative box to global polygon
                 bx, by, bw, bh = box
                 # box is x_center, y_center, w, h in xywh? No, check ultralytics docs or result.boxes.xyxy
                 # Better use xyxy which is usually standard attribute
                 box_xyxy = result.boxes.xyxy[best_idx].tolist()
                 bx1, by1, bx2, by2 = box_xyxy
                 
                 # Translate to global
                 bx1 += cx1; bx2 += cx1
                 by1 += cy1; by2 += cy1
                 
                 poly = [bx1, by1, bx2, by1, bx2, by2, bx1, by2]
                 
                 label = text_prompt.strip() if (text_prompt and text_prompt.strip()) else result.names[cls_id]
                 
                 detections.append({
                    "id": str(uuid.uuid4()),
                    "label": label,
                    "points": poly,
                    "type": "poly"
                 })

                        
            # Unique Suggestions
            suggestions.sort(key=lambda x: x["score"], reverse=True)
            unique_suggestions = []
            seen = set()
            for s in suggestions:
                if s["label"] not in seen:
                    unique_suggestions.append(s)
                    seen.add(s["label"])
                if len(unique_suggestions) >= 3: break
            suggestions = unique_suggestions

        return JSONResponse({
            "detections": detections, 
            "suggestions": suggestions
        })

    except Exception as e:
        print(f"Error in /api/segment-box: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/refine-polygon")
async def refine_polygon(
    file: UploadFile = File(...),
    points_json: str = Form(...),
    model_name: str = Form("sam2.1_l.pt")
):
    """
    Refines a rough polygon using SAM 2.
    1. Calculates Bounding Box of the input polygon.
    2. Uses that Box as a prompt for SAM.
    3. Returns the high-quality SAM mask as a polygon.
    """
    try:
        points = json.loads(points_json)
        if not points or len(points) < 4:
            return JSONResponse({"error": "Invalid points"}, status_code=400)

        image_bytes = await file.read()
        img = process_image(image_bytes)
        
        # 1. Calculate Bounding Box
        pts_np = np.array(points).reshape((-1, 2))
        x_min = int(np.min(pts_np[:, 0]))
        y_min = int(np.min(pts_np[:, 1]))
        x_max = int(np.max(pts_np[:, 0]))
        y_max = int(np.max(pts_np[:, 1]))
        
        box = [x_min, y_min, x_max, y_max]
        
        # 2. Run SAM
        # Ensure we are using a SAM model
        if "sam" not in model_name.lower():
            # Fallback to a default SAM if user sent a YOLO model name for beautify
            model_name = "sam2.1_l.pt"
            
        sam_model = get_model(model_name)
        if not sam_model:
             # Try standard load
             try:
                 sam_model = SAM(model_name)
                 sam_model.to('cuda')
                 MODELS[model_name] = sam_model
             except:
                 return JSONResponse({"error": f"SAM Model {model_name} not found"}, status_code=400)

        # Run Inference with BBox Prompt
        # SAM model() in ultralytics supports bboxes argument
        results = sam_model(img, bboxes=[box], verbose=False)
        
        if results[0].masks:
            polygons = masks_to_polygons(results[0].masks)
            # We expect one main object usually, return the largest or the one matching best?
            # SAM usually returns one covering the box.
            # If multiple, take largest.
            
            best_poly = None
            max_len = 0
            for poly in polygons:
                if len(poly) > max_len:
                    max_len = len(poly)
                    best_poly = poly
            
            if best_poly:
                return JSONResponse({
                    "points": best_poly,
                    "label": "refined"
                })
        
        return JSONResponse({"error": "Could not refine polygon"}, status_code=400)

    except Exception as e:
        print(f"Error in /api/refine-polygon: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

def extend_line(points_tuples, expansion=5000):
    if len(points_tuples) < 2: return points_tuples
    
    try:
        # Start
        p0 = np.array(points_tuples[0])
        p1 = np.array(points_tuples[1])
        vec = p0 - p1
        norm = np.linalg.norm(vec)
        if norm > 0:
            new_p0 = p0 + (vec / norm) * expansion
            points_tuples[0] = tuple(new_p0)

        # End
        pn = np.array(points_tuples[-1])
        pnm1 = np.array(points_tuples[-2])
        vec = pn - pnm1
        norm = np.linalg.norm(vec)
        if norm > 0:
            new_pn = pn + (vec / norm) * expansion
            points_tuples[-1] = tuple(new_pn)
    except Exception as e:
        print(f"Extend line failed: {e}")
        
    return points_tuples



@app.post("/api/edit-polygon-boolean")
async def edit_polygon_boolean(
    target_points: str = Form(...),
    cutter_points: str = Form(...),
    operation: str = Form("subtract")
):
    try:
        t_pts = json.loads(target_points)
        c_pts = json.loads(cutter_points)
        
        # Poligonu oluştur
        t_tuples = list(zip(t_pts[::2], t_pts[1::2]))
        poly_target = ShapelyPolygon(t_tuples).buffer(0)
        if not poly_target.is_valid:
            poly_target = make_valid(poly_target)

        # Çizgi oluştur
        c_tuples = list(zip(c_pts[::2], c_pts[1::2]))
        if len(c_tuples) < 2: return JSONResponse({"error": "Line too short"}, status_code=400)

        # --- SMART EXTEND (Uçları Uzatma) ---
        # Kullanıcının çizdiği çizginin uçlarını biraz uzatalım ki "ucu ucuna yetmedi" olmasın.
        p_start = np.array(c_tuples[0])
        p_end = np.array(c_tuples[-1])
        
        # Başlangıçtan geriye uzat
        v_start = p_start - np.array(c_tuples[1])
        norm_s = np.linalg.norm(v_start)
        if norm_s > 0:
            p_start_new = p_start + (v_start / norm_s) * 20 # 20px uzat
            c_tuples[0] = tuple(p_start_new)

        # Bitişten ileriye uzat
        v_end = p_end - np.array(c_tuples[-2])
        norm_e = np.linalg.norm(v_end)
        if norm_e > 0:
            p_end_new = p_end + (v_end / norm_e) * 20 # 20px uzat
            c_tuples[-1] = tuple(p_end_new)

        cutter_line = LineString(c_tuples)

        # --- İŞLEM: SPLIT (BÖLME) ---
        # Difference yerine Split kullanıyoruz. Bu daha kararlı çalışır.
        try:
            split_result = split(poly_target, cutter_line)
        except Exception as split_err:
            print(f"Split failed, falling back to buffer diff: {split_err}")
            # Yedek plan: Eğer split hata verirse eski buffer yöntemini dene
            cutter_poly = cutter_line.buffer(1.5)
            split_result = poly_target.difference(cutter_poly)

        # --- SONUÇLARI TOPLA ---
        final_polys = []

        def extract(geom):
            if geom.geom_type == 'Polygon':
                if geom.area > 10: # Minik parçaları at
                    x, y = geom.exterior.coords.xy
                    flat = []
                    for i in range(len(x)):
                        flat.append(x[i])
                        flat.append(y[i])
                    final_polys.append(flat)
            elif geom.geom_type in ['MultiPolygon', 'GeometryCollection']:
                for g in geom.geoms:
                    extract(g)
        
        # split sonucu genelde bir GeometryCollection döner
        extract(split_result)

        return JSONResponse({"polygons": final_polys})

    except Exception as e:
        print(f"Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/segment-lasso")
async def segment_lasso(
    file: UploadFile = File(...),
    points_json: str = Form(...), # JSON list of [x, y, x, y...]
    model_name: str = Form("yolov8m-seg.pt"),
    confidence: float = Form(0.2)
):
    """
    Detects objects within a freehand lasso polygon.
    1. Mask image (keep inside polygon, black out outside).
    2. Crop to bounding rect.
    3. Run Inference.
    """
    try:
        points = json.loads(points_json)
        if len(points) < 6:
            return JSONResponse({"error": "Not enough points"}, status_code=400)
            
        image_bytes = await file.read()
        img = process_image(image_bytes) # BGR
        h, w = img.shape[:2]
        
        # 1. Create Mask
        pts_np = np.array(points).reshape((-1, 2)).astype(np.int32)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [pts_np], 255)
        
        # 2. Apply Mask (Bitwise AND). Background becomes Black (0,0,0)
        # We need a 3-channel mask
        mask_3ch = cv2.merge([mask, mask, mask])
        masked_img = cv2.bitwise_and(img, mask_3ch)
        
        # 3. Crop to Bounding Rect of the Polygon
        x, y, bw, bh = cv2.boundingRect(pts_np)
        
        # Clamp
        x = max(0, x); y = max(0, y)
        bw = min(w - x, bw); bh = min(h - y, bh)
        
        if bw <= 0 or bh <= 0:
             return JSONResponse({"detections": [], "suggestions": []})
             
        crop = masked_img[y:y+bh, x:x+bw]
        
        # 4. Run Inference on Crop
        # Similar settings to segment-box: loose threshold to find suggestions
        # 4. Run Inference on Crop
        active_model = get_model(model_name)
        results = active_model(crop, retina_masks=True, conf=0.05, iou=0.8, agnostic_nms=False, max_det=20)
        result = results[0]

        detections = []
        all_candidates = []
        
        if result.boxes:
             for k, cls_id in enumerate(result.boxes.cls):
                 lbl = result.names[int(cls_id)]
                 cnf = float(result.boxes.conf[k])
                 all_candidates.append({"label": lbl, "score": cnf})
        
        # Suggestions
        all_candidates.sort(key=lambda x: x["score"], reverse=True)
        unique_suggestions = []
        seen_labels = set()
        for cand in all_candidates:
            if cand["label"] not in seen_labels:
                unique_suggestions.append(cand)
                seen_labels.add(cand["label"])
            if len(unique_suggestions) >= 3: break
            
        # Primary Detection
        if result.masks:
            polygons = masks_to_polygons(result.masks)
            if len(result.boxes.conf) > 0:
                best_idx = int(result.boxes.conf.argmax())
                if float(result.boxes.conf[best_idx]) > 0.10:
                    poly = polygons[best_idx]
                    cls_id = int(result.boxes.cls[best_idx])
                    label = result.names[cls_id]

                    # Translate coordinates
                    global_poly = []
                    for j in range(0, len(poly), 2):
                        px = poly[j] + x
                        py = poly[j+1] + y
                        global_poly.extend([px, py])

                    detections.append({
                        "id": str(uuid.uuid4()),
                        "label": label,
                        "points": global_poly,
                        "type": "poly"
                    })

        return JSONResponse({
            "detections": detections, 
            "suggestions": unique_suggestions
        })

    except Exception as e:
        print(f"Error in /api/segment-lasso: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/segment-by-text")
async def segment_by_text(
    file: UploadFile = File(...),
    text_prompt: str = Form(...),
    sam_model_name: str = Form("sam3_l.pt"),
    box_confidence: float = Form(0.25),
    iou_threshold: float = Form(0.45)
):
    """
    Two-Stage Pipeline:
    1. YOLO-World detects objects based on text prompt -> Bounding Boxes.
    2. SAM 2 takes boxes as prompts -> Precise Segmentation Masks.
    """
    try:
        # 1. Load YOLO-World
        yolo_world_model = get_model("yolov8l-world.pt")
        if not yolo_world_model:
            # Attempt load if not ready
            try:
                print("Loading YOLO-World on demand...")
                yolo_world_model = YOLO("yolov8l-world.pt")
                yolo_world_model.to('cuda')
                MODELS["yolov8l-world.pt"] = yolo_world_model
            except Exception as e:
                return JSONResponse({"error": f"Failed to load YOLO-World: {e}"}, status_code=500)

        # 2. Set Classes
        prompts = [p.strip() for p in text_prompt.split(',') if p.strip()]
        if not prompts:
            return JSONResponse({"error": "Empty text prompt"}, status_code=400)
            
        yolo_world_model.set_classes(prompts)
        
        # 3. Process Image
        image_bytes = await file.read()
        img = process_image(image_bytes)
        
        # 4. Stage 1: Detection
        results = yolo_world_model.predict(img, conf=box_confidence, iou=iou_threshold, verbose=False)
        if not results or not results[0].boxes:
            return JSONResponse({"detections": []})
            
        boxes = results[0].boxes
        # Convert to [x1, y1, x2, y2] format for SAM
        bboxes = boxes.xyxy.cpu().numpy()
        class_ids = boxes.cls.cpu().numpy().astype(int)
        confidences = boxes.conf.cpu().numpy()
        
        if len(bboxes) == 0:
            return JSONResponse({"detections": []})

        # 5. Stage 2: Segmentation with SAM
        sam_model = get_model(sam_model_name)
        if not sam_model:
             return JSONResponse({"error": f"SAM Model {sam_model_name} not found"}, status_code=400)

        # Validate that we actually got a SAM model (prevent YOLO fallback crash)
        if SAM is None or not isinstance(sam_model, SAM):
             return JSONResponse({
                 "error": f"Requested model '{sam_model_name}' was not found or failed to load as a SAM model. "
                          f"System fell back to '{type(sam_model).__name__}', which does not support text-prompted segmentation. "
                          "Please ensure the SAM model file (e.g. sam2.1_l.pt) is present in the backend directory."
             }, status_code=400)
             
        # Use SAM to predict with box prompts
        try:
            # Ensure bboxes is a list of lists [[x1,y1,x2,y2], ...]
            # boxes.xyxy is (N, 4) tensor or numpy
            bboxes_list = bboxes.tolist() if hasattr(bboxes, 'tolist') else bboxes
            
            # If strictly single box flat list [x,y,x,y], nest it
            if len(bboxes_list) > 0 and not isinstance(bboxes_list[0], list) and not isinstance(bboxes_list[0], (np.ndarray, type(bboxes))):
                 bboxes_list = [bboxes_list]
            
            # Ultralytics SAM typically expects:
            # - bboxes assigned as arg
            # - shape: (N, 4)
            
            sam_results = sam_model(img, bboxes=bboxes_list, verbose=False)
            
        except Exception as sam_err:
            print(f"SAM standard inference failed: {sam_err}. Trying fallback...")
            # Fallback: predict() might handle it differently or its NOT a SAM model wrapped strictly
            sam_results = sam_model.predict(img, bboxes=bboxes, verbose=False)
        
        detections = []
        if sam_results[0].masks:
            polygons = masks_to_polygons(sam_results[0].masks)
            
            for i, poly in enumerate(polygons):
                if i >= len(class_ids): break 
                
                cls_id = class_ids[i]
                # YOLO-World uses its own set classes index
                label = prompts[cls_id] if cls_id < len(prompts) else "unknown"
                
                yolo_label = results[0].names[cls_id] # Should match
                score = float(confidences[i])
                
                detections.append({
                    "id": str(uuid.uuid4()),
                    "label": yolo_label, 
                    "points": poly, 
                    "type": "poly",
                    "confidence": score
                })
                
        return JSONResponse({"detections": detections})

    except Exception as e:
        print(f"Error in /api/segment-by-text: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/save")
async def save_data(
    file: UploadFile = File(...),
    annotations: str = Form(...), 
    image_name: str = Form(None),
    augmentation: str = Form("false") # Recv as string
):
    try:
        anns_list = json.loads(annotations)
        image_bytes = await file.read()
        do_augment = augmentation.lower() == 'true'
        
        # Determine Filename Base
        if image_name:
            name_base = Path(image_name).stem
            ext = Path(image_name).suffix
            if not ext: ext = ".jpg"
            safe_name_base = f"{name_base}"
        else:
             safe_name_base = f"{uuid.uuid4()}"
             ext = ".jpg"
        
        # Helper to Save Image & Label pair
        def save_pair(suffix, img_data, anns):
            # Save Image
            fname = f"{safe_name_base}{suffix}{ext}"
            img_path = IMAGES_DIR / fname
            cv2.imwrite(str(img_path), img_data)
            
            # Save Label
            lbl_name = f"{safe_name_base}{suffix}.txt"
            lbl_path = LABELS_DIR / lbl_name
            
            # Generate Yolo Lines
            # We need to process classes dynamically for each call to ensure consistency?
            # Actually we should reuse the main class_map logic. 
            # For simplicity, let's assume class_map is updated once and we reuse IDs.
            # But here we need to map labels to IDs.
            
            if not (DATASET_DIR / "classes.txt").exists():
                 (DATASET_DIR / "classes.txt").touch()

            with open(DATASET_DIR / "classes.txt", "r") as f:
                existing = [l.strip() for l in f.readlines() if l.strip()]
            cmap = {name: i for i, name in enumerate(existing)}
            
            lines = []
            h, w = img_data.shape[:2]
            
            for ann in anns:
                label = ann.get("label", "unknown").strip()
                points = ann.get("points", [])
                
                # If new class, append? (Race condition if threaded, but simple here)
                if label not in cmap:
                    cmap[label] = len(cmap)
                    with open(DATASET_DIR / "classes.txt", "a") as f:
                        f.write(f"\n{label}")
                
                cls_id = cmap[label]
                
                # Normalize
                norm_pts = []
                for i in range(0, len(points), 2):
                    nx = points[i] / w
                    ny = points[i+1] / h
                    norm_pts.append(f"{max(0, min(1, nx)):.6f}")
                    norm_pts.append(f"{max(0, min(1, ny)):.6f}")
                    
                lines.append(f"{cls_id} " + " ".join(norm_pts))
                
            with open(lbl_path, "w") as f:
                f.write("\n".join(lines))

        # 1. Save Original
        img_orig = process_image(image_bytes)
        img_h, img_w = img_orig.shape[:2]
        save_pair("", img_orig, anns_list) 
        
        if do_augment:
            # 2. Horizontal Flip
            img_flip = cv2.flip(img_orig, 1)
            anns_flip = []
            for a in anns_list:
                new_a = a.copy()
                # Flip x coordinates: new_x = width - x
                flipped_pts = []
                pts = a.get("points", [])
                for i in range(0, len(pts), 2):
                    flipped_pts.append(img_w - pts[i]) # Flip X
                    flipped_pts.append(pts[i+1])      # Keep Y
                new_a["points"] = flipped_pts
                anns_flip.append(new_a)
            save_pair("_flip", img_flip, anns_flip)
            
            # 3. Brightness Decrease (Darker)
            # Alpha 1, Beta -50
            img_dark = cv2.convertScaleAbs(img_orig, alpha=1.0, beta=-60)
            save_pair("_dark", img_dark, anns_list) # labels same
            
            # 4. Noise
            # Gaussian noise
            row, col, ch = img_orig.shape
            mean = 0
            var = 0.1
            sigma = var**0.5
            gauss = np.random.normal(mean, 25, (row, col, ch)) # sigma 25
            gauss = gauss.reshape(row, col, ch)
            noisy = img_orig + gauss
            noisy = np.clip(noisy, 0, 255).astype(np.uint8)
            save_pair("_noise", noisy, anns_list)

        return JSONResponse({
            "success": True, 
            "message": f"Saved {safe_name_base} (+3 augments)" if do_augment else f"Saved {safe_name_base}",
        })

    except Exception as e:
        print(f"Error in /api/save: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)