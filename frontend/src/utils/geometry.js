// --- Distance Point to Segment ---
export const distanceToSegment = (p, v, w) => {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    // projection of point p on line segment vw
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.sqrt(Math.pow(p.x - proj.x, 2) + Math.pow(p.y - proj.y, 2));
};

// --- Bounding Box Intersection ---
export const doBoxesIntersect = (box1, box2) => {
    return (
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.y + box1.height > box2.y
    );
};

// --- Get Poly Bounds ---
export const getPolyBounds = (points) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i], y = points[i + 1];
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

// --- Get Line Bounds ---
export const getLineBounds = (points) => {
    return getPolyBounds(points);
};

// --- Point in Polygon Test ---
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

// --- Helper: Simplify Points (Ramer-Douglas-Peucker) ---
const getSqDist = (p1, p2) => {
    return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
};

const getSqSegDist = (p, p1, p2) => {
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

export const simplifyPoints = (points, tolerance) => {
    if (points.length <= 2) return points;
    const sqTolerance = tolerance * tolerance;

    // Convert flat array to objects if needed, but here we expect flat [x,y,x,y]?
    // Our points state is flat array [x,y, x,y]. Convert to objects first.
    const ptsObj = [];
    for (let i = 0; i < points.length; i += 2) ptsObj.push({ x: points[i], y: points[i + 1] });

    const simplifyDP = (points) => {
        const len = points.length;
        let maxSqDist = 0;
        let index = 0;

        for (let i = 1; i < len - 1; i++) {
            const sqDist = getSqSegDist(points[i], points[0], points[len - 1]);
            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            const left = simplifyDP(points.slice(0, index + 1));
            const right = simplifyDP(points.slice(index));
            return [...left.slice(0, left.length - 1), ...right];
        } else {
            return [points[0], points[len - 1]];
        }
    };

    const simplified = simplifyDP(ptsObj);
    return simplified.flatMap(p => [p.x, p.y]);
};
