/**
 * Geometry Utilities
 * React-independent geometric calculations for polygon operations
 */

/**
 * Calculate the distance from a point to a line segment
 * @param {Object} p - Point {x, y}
 * @param {Object} v - Segment start point {x, y}
 * @param {Object} w - Segment end point {x, y}
 * @returns {number} Distance from point to segment
 */
export const distanceToSegment = (p, v, w) => {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.sqrt(Math.pow(p.x - proj.x, 2) + Math.pow(p.y - proj.y, 2));
};

/**
 * Check if two bounding boxes intersect
 * @param {Object} box1 - First box {x, y, width, height}
 * @param {Object} box2 - Second box {x, y, width, height}
 * @returns {boolean} True if boxes intersect
 */
export const doBoxesIntersect = (box1, box2) => {
    return (
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.y + box1.height > box2.y
    );
};

/**
 * Get the bounding box of a polygon
 * @param {number[]} points - Flat array of coordinates [x1, y1, x2, y2, ...]
 * @returns {Object} Bounding box {x, y, width, height}
 */
export const getPolyBounds = (points) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i], y = points[i + 1];
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/**
 * Get the bounding box of a line (alias for getPolyBounds)
 * @param {number[]} points - Flat array of coordinates [x1, y1, x2, y2, ...]
 * @returns {Object} Bounding box {x, y, width, height}
 */
export const getLineBounds = (points) => {
    return getPolyBounds(points);
};

/**
 * Test if a point is inside a polygon using ray casting algorithm
 * @param {Object} point - Point {x, y}
 * @param {Object[]} polygon - Array of vertices [{x, y}, ...]
 * @returns {boolean} True if point is inside polygon
 */
export const pointInPolygon = (point, polygon) => {
    const x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

/**
 * Squared distance between two points
 * @param {Object} p1 - First point {x, y}
 * @param {Object} p2 - Second point {x, y}
 * @returns {number} Squared distance
 */
export const getSqDist = (p1, p2) => {
    return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
};

/**
 * Squared distance from point to segment
 * @param {Object} p - Point {x, y}
 * @param {Object} p1 - Segment start {x, y}
 * @param {Object} p2 - Segment end {x, y}
 * @returns {number} Squared distance
 */
export const getSqSegDist = (p, p1, p2) => {
    let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;
    if (dx !== 0 || dy !== 0) {
        const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2.x; y = p2.y;
        } else if (t > 0) {
            x += dx * t; y += dy * t;
        }
    }
    dx = p.x - x; dy = p.y - y;
    return dx * dx + dy * dy;
};

/**
 * Simplify polygon points using Ramer-Douglas-Peucker algorithm
 * @param {number[]} points - Flat array of coordinates [x1, y1, x2, y2, ...]
 * @param {number} tolerance - Simplification tolerance (higher = more aggressive)
 * @returns {number[]} Simplified flat array of coordinates
 */
export const simplifyPoints = (points, tolerance = 2.0) => {
    if (points.length <= 4) return points; // Need at least 2 points
    const sqTolerance = tolerance * tolerance;

    // Convert flat array to objects
    const ptsObj = [];
    for (let i = 0; i < points.length; i += 2) {
        ptsObj.push({ x: points[i], y: points[i + 1] });
    }

    const simplifyDP = (pts) => {
        const len = pts.length;
        if (len <= 2) return pts;

        let maxSqDist = 0;
        let index = 0;

        for (let i = 1; i < len - 1; i++) {
            const sqDist = getSqSegDist(pts[i], pts[0], pts[len - 1]);
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            const left = simplifyDP(pts.slice(0, index + 1));
            const right = simplifyDP(pts.slice(index));
            return [...left.slice(0, left.length - 1), ...right];
        } else {
            return [pts[0], pts[len - 1]];
        }
    };

    const simplified = simplifyDP(ptsObj);
    return simplified.flatMap(p => [p.x, p.y]);
};

/**
 * Add midpoints between vertices to densify a polygon
 * @param {number[]} points - Flat array of coordinates [x1, y1, x2, y2, ...]
 * @returns {number[]} Densified flat array of coordinates
 */
export const densifyPoints = (points) => {
    if (points.length < 4) return points;

    const newPts = [];
    const numPoints = points.length / 2;

    for (let i = 0; i < numPoints; i++) {
        const currentX = points[i * 2];
        const currentY = points[i * 2 + 1];

        // Add current point
        newPts.push(currentX, currentY);

        // Get next point (wrap around for polygon)
        const nextIndex = (i + 1) % numPoints;
        const nextX = points[nextIndex * 2];
        const nextY = points[nextIndex * 2 + 1];

        // Calculate and add midpoint
        const midX = (currentX + nextX) / 2;
        const midY = (currentY + nextY) / 2;
        newPts.push(midX, midY);
    }

    return newPts;
};

/**
 * Convert flat points array to array of point objects
 * @param {number[]} points - Flat array [x1, y1, x2, y2, ...]
 * @returns {Object[]} Array of point objects [{x, y}, ...]
 */
export const flatToPoints = (points) => {
    const result = [];
    for (let i = 0; i < points.length; i += 2) {
        result.push({ x: points[i], y: points[i + 1] });
    }
    return result;
};

/**
 * Convert array of point objects to flat array
 * @param {Object[]} points - Array of point objects [{x, y}, ...]
 * @returns {number[]} Flat array [x1, y1, x2, y2, ...]
 */
export const pointsToFlat = (points) => {
    return points.flatMap(p => [p.x, p.y]);
};
