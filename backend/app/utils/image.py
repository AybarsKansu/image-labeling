"""
Image processing utilities.
OpenCV helpers for decoding, tiling, cropping, and NMS.
"""

import cv2
import numpy as np
from typing import List, Tuple


def decode_image(file_bytes: bytes) -> np.ndarray:
    """
    Decodes image bytes to OpenCV BGR image.
    
    Args:
        file_bytes: Raw image bytes
        
    Returns:
        OpenCV image array (BGR format)
        
    Raises:
        ValueError: If image cannot be decoded
    """
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


def get_slices(
    img_h: int, 
    img_w: int, 
    tile_size: int = 640, 
    overlap: float = 0.2
) -> List[Tuple[int, int, int, int]]:
    """
    Generates tile slice coordinates for tiled inference.
    
    Args:
        img_h: Image height
        img_w: Image width
        tile_size: Size of each tile (square)
        overlap: Overlap ratio between tiles (0-1)
        
    Returns:
        List of (x1, y1, x2, y2) tuples for each tile
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
            
            if x2 >= img_w:
                break
        if y2 >= img_h:
            break
        
    return slices


def safe_nms(
    boxes: List[List[float]], 
    scores: List[float], 
    iou_threshold: float = 0.5
) -> List[int]:
    """
    Applies Non-Maximum Suppression using OpenCV.
    
    Args:
        boxes: List of [x, y, w, h] bounding boxes
        scores: List of confidence scores
        iou_threshold: IoU threshold for suppression
        
    Returns:
        List of indices of boxes to keep
    """
    if not boxes:
        return []
    
    # cv2.dnn.NMSBoxes expects [x, y, w, h]
    indices = cv2.dnn.NMSBoxes(
        boxes, 
        scores, 
        score_threshold=0.01, 
        nms_threshold=iou_threshold
    )
    
    if len(indices) == 0:
        return []
    
    return [int(i) for i in indices]


def crop_image(
    img: np.ndarray, 
    x1: int, 
    y1: int, 
    x2: int, 
    y2: int
) -> np.ndarray:
    """
    Safely crops an image with bounds checking.
    
    Args:
        img: Source image
        x1, y1: Top-left corner
        x2, y2: Bottom-right corner
        
    Returns:
        Cropped image region
    """
    h, w = img.shape[:2]
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(w, x2)
    y2 = min(h, y2)
    return img[y1:y2, x1:x2]


def masks_to_polygons(masks) -> List[List[float]]:
    """
    Converts YOLO/SAM masks to flat polygon point lists.
    
    Args:
        masks: YOLO/SAM masks object with .xy attribute
        
    Returns:
        List of flat polygon lists [x1, y1, x2, y2, ...]
    """
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
