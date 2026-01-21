"""
Geometry Service.
Shapely/polygon operations for editing and manipulation.
"""

import numpy as np
from typing import List, Tuple, Optional
from shapely.geometry import Polygon as ShapelyPolygon, LineString, GeometryCollection, MultiPolygon
from shapely.ops import split
from shapely.validation import make_valid


def extend_line(points_tuples: List[Tuple[float, float]], expansion: float = 5000) -> List[Tuple[float, float]]:
    """
    Extends the endpoints of a line outward.
    
    Args:
        points_tuples: List of (x, y) tuples defining the line
        expansion: Distance to extend each endpoint
        
    Returns:
        Modified list with extended endpoints
    """
    if len(points_tuples) < 2:
        return points_tuples
    
    points_tuples = list(points_tuples)  # Make a copy
    
    try:
        # Extend start point
        p0 = np.array(points_tuples[0])
        p1 = np.array(points_tuples[1])
        vec = p0 - p1
        norm = np.linalg.norm(vec)
        if norm > 0:
            new_p0 = p0 + (vec / norm) * expansion
            points_tuples[0] = tuple(new_p0)

        # Extend end point
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


def split_polygon(
    target_points: List[float],
    cutter_points: List[float],
    min_area: float = 10.0
) -> List[List[float]]:
    """
    Splits a polygon using a cutting line.
    
    Args:
        target_points: Flat polygon points [x1, y1, x2, y2, ...]
        cutter_points: Flat line points [x1, y1, x2, y2, ...]
        min_area: Minimum area for result polygons
        
    Returns:
        List of flat polygon point lists
    """
    # Convert to tuples
    t_tuples = list(zip(target_points[::2], target_points[1::2]))
    c_tuples = list(zip(cutter_points[::2], cutter_points[1::2]))
    
    if len(c_tuples) < 2:
        raise ValueError("Cutter line too short")
    
    # Create target polygon
    poly_target = ShapelyPolygon(t_tuples).buffer(0)
    if not poly_target.is_valid:
        poly_target = make_valid(poly_target)
    
    # Extend cutter line endpoints slightly
    c_tuples = extend_line(c_tuples, expansion=20)
    cutter_line = LineString(c_tuples)
    
    # Perform split
    try:
        split_result = split(poly_target, cutter_line)
    except Exception as split_err:
        print(f"Split failed, falling back to buffer diff: {split_err}")
        # Fallback: buffer the line and subtract
        cutter_poly = cutter_line.buffer(1.5)
        split_result = poly_target.difference(cutter_poly)
    
    # Extract resulting polygons
    final_polys = []
    _extract_polygons(split_result, final_polys, min_area)
    
    return final_polys


def _extract_polygons(
    geom, 
    result_list: List[List[float]], 
    min_area: float = 10.0
) -> None:
    """
    Recursively extracts polygons from a geometry.
    
    Args:
        geom: Shapely geometry
        result_list: List to append results to
        min_area: Minimum polygon area to include
    """
    if geom.geom_type == 'Polygon':
        if geom.area > min_area:
            x, y = geom.exterior.coords.xy
            flat = []
            for i in range(len(x)):
                flat.append(float(x[i]))
                flat.append(float(y[i]))
            result_list.append(flat)
    elif geom.geom_type in ['MultiPolygon', 'GeometryCollection']:
        for g in geom.geoms:
            _extract_polygons(g, result_list, min_area)


def validate_polygon(points: List[float]) -> bool:
    """
    Validates that points form a valid polygon.
    
    Args:
        points: Flat polygon points [x1, y1, x2, y2, ...]
        
    Returns:
        True if valid polygon with at least 3 vertices
    """
    if len(points) < 6:  # At least 3 points (6 values)
        return False
    
    try:
        tuples = list(zip(points[::2], points[1::2]))
        poly = ShapelyPolygon(tuples)
        return poly.is_valid or make_valid(poly).is_valid
    except Exception:
        return False


def intersect_polygon_with_box(
    poly_coords: List[Tuple[float, float]],
    box: Tuple[int, int, int, int],
    img_w: int,
    img_h: int
) -> List[Tuple[int, List[float]]]:
    """
    Intersects a polygon with a bounding box and returns normalized coordinates.
    
    Args:
        poly_coords: List of (x, y) tuples (normalized 0-1)
        box: (x1, y1, x2, y2) tile bounding box
        img_w: Original image width
        img_h: Original image height
        
    Returns:
        List of (class_id, normalized_points) tuples
    """
    x1, y1, x2, y2 = box
    tw, th = x2 - x1, y2 - y1
    
    # Denormalize to absolute coordinates
    abs_coords = [(x * img_w, y * img_h) for x, y in poly_coords]
    
    poly_shape = ShapelyPolygon(abs_coords)
    if not poly_shape.is_valid:
        poly_shape = make_valid(poly_shape)
    
    tile_box_poly = ShapelyPolygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
    
    try:
        intersection = tile_box_poly.intersection(poly_shape)
        
        if intersection.is_empty:
            return []
        
        result = []
        geoms = []
        
        if intersection.geom_type == 'Polygon':
            geoms.append(intersection)
        elif intersection.geom_type == 'MultiPolygon':
            geoms.extend(intersection.geoms)
        elif intersection.geom_type == 'GeometryCollection':
            for g in intersection.geoms:
                if g.geom_type == 'Polygon':
                    geoms.append(g)
        
        for g in geoms:
            g_coords = list(g.exterior.coords)
            flattened = []
            for gx, gy in g_coords[:-1]:  # Skip last duplicate
                nx = (gx - x1) / tw
                ny = (gy - y1) / th
                # Clip to 0-1
                nx = min(max(nx, 0), 1)
                ny = min(max(ny, 0), 1)
                flattened.extend([nx, ny])
            
            if len(flattened) >= 6:  # At least triangle
                result.append(flattened)
        
        return result
        
    except Exception as e:
        print(f"Polygon intersection error: {e}")
        return []


def polygon_bounding_box(points: List[float]) -> Tuple[int, int, int, int]:
    """
    Calculates bounding box of a polygon.
    
    Args:
        points: Flat polygon points [x1, y1, x2, y2, ...]
        
    Returns:
        (x_min, y_min, x_max, y_max) bounding box
    """
    pts_np = np.array(points).reshape((-1, 2))
    x_min = int(np.min(pts_np[:, 0]))
    y_min = int(np.min(pts_np[:, 1]))
    x_max = int(np.max(pts_np[:, 0]))
    y_max = int(np.max(pts_np[:, 1]))
    return x_min, y_min, x_max, y_max
