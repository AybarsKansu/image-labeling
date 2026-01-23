/**
 * AnnotationConverter
 * Universal converter for annotation formats.
 * In-memory state: COCO-compliant structure
 * Storage format: TOON (Token-Efficient Object Notation)
 */

// ============================================
// TOON FORMAT (v1.0) - Schema-less Array Structure
// ============================================
// {
//   "v": "1.0",                          // Version
//   "m": [FileName, Width, Height],      // Meta
//   "c": [class1, class2, ...],          // Categories
//   "d": [                               // Data
//     [category_index, [x,y,x,y...]],    // Each annotation
//   ]
// }

class AnnotationConverter {
    // ============================================
    // INTERNAL STATE ↔ COCO
    // ============================================

    /**
     * Convert internal annotation state to COCO format
     * @param {Array} annotations - Array of {id, label, points, type}
     * @param {Object} imageInfo - {name, width, height}
     * @returns {Object} COCO-compliant object
     */
    static internalToCoco(annotations, imageInfo) {
        // Build category map from unique labels
        const categoryMap = new Map();
        annotations.forEach(ann => {
            const label = ann.label || 'unknown';
            if (!categoryMap.has(label)) {
                categoryMap.set(label, categoryMap.size + 1);
            }
        });

        const categories = Array.from(categoryMap.entries()).map(([name, id]) => ({
            id,
            name
        }));

        const cocoAnnotations = annotations.map((ann, idx) => {
            const points = ann.points || [];
            const label = ann.label || 'unknown';

            // Calculate bounding box from points
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < points.length; i += 2) {
                minX = Math.min(minX, points[i]);
                maxX = Math.max(maxX, points[i]);
                minY = Math.min(minY, points[i + 1]);
                maxY = Math.max(maxY, points[i + 1]);
            }

            const width = maxX - minX;
            const height = maxY - minY;
            const area = width * height;

            return {
                id: ann.id || idx + 1,
                image_id: 1,
                category_id: categoryMap.get(label),
                segmentation: [points], // COCO uses nested array
                bbox: [minX, minY, width, height],
                area: area,
                iscrowd: 0
            };
        });

        return {
            images: [{
                id: 1,
                file_name: imageInfo.name || 'image.jpg',
                width: imageInfo.width,
                height: imageInfo.height
            }],
            annotations: cocoAnnotations,
            categories
        };
    }

    /**
     * Convert COCO format to internal annotation state
     * @param {Object} cocoData - COCO-compliant object
     * @returns {Object} {annotations: Array, categories: Array}
     */
    static cocoToInternal(cocoData) {
        if (!cocoData || typeof cocoData !== 'object') {
            throw new Error('Invalid data: COCO input must be a JSON object.');
        }
        if (!cocoData.annotations && !cocoData.categories && !cocoData.images) {
            throw new Error('Invalid COCO format: Missing standard COCO keys (images, annotations, categories).');
        }
        const categoryIdToName = new Map();
        (cocoData.categories || []).forEach(cat => {
            categoryIdToName.set(cat.id, cat.name);
        });

        const annotations = (cocoData.annotations || []).map(ann => ({
            id: String(ann.id),
            type: 'poly',
            label: categoryIdToName.get(ann.category_id) || 'unknown',
            points: ann.segmentation?.[0] || [],
            originalRawPoints: ann.segmentation?.[0] || []
        }));

        const categories = Array.from(categoryIdToName.values());

        return { annotations, categories };
    }

    // ============================================
    // TOON FORMAT
    // ============================================

    /**
     * Convert COCO to TOON format for storage
     * @param {Object} cocoData - COCO-compliant object
     * @returns {Object} TOON object
     */
    static cocoToToon(cocoData) {
        const image = cocoData.images?.[0] || {};
        const categories = (cocoData.categories || [])
            .sort((a, b) => a.id - b.id)
            .map(c => c.name);

        // Build category id to index map
        const catIdToIdx = new Map();
        cocoData.categories?.forEach((cat, idx) => {
            catIdToIdx.set(cat.id, idx);
        });

        const data = (cocoData.annotations || []).map(ann => {
            const catIdx = catIdToIdx.get(ann.category_id) ?? 0;
            const points = ann.segmentation?.[0] || [];
            // Round points to 2 decimals for efficiency
            const roundedPoints = points.map(p => Math.round(p * 100) / 100);
            return [catIdx, roundedPoints];
        });

        return {
            v: '1.0',
            m: [image.file_name || 'image.jpg', image.width || 0, image.height || 0],
            c: categories,
            d: data
        };
    }

    /**
     * Convert TOON format to COCO
     * @param {Object} toonData - TOON object
     * @returns {Object} COCO-compliant object
     */
    static toonToCoco(toonData) {
        if (!toonData || typeof toonData !== 'object') {
            throw new Error('Invalid data: Input is not a JSON object.');
        }
        // Basic TOON validation: must have 'd' (data) or 'v' (version)
        if (!Array.isArray(toonData.d)) {
            throw new Error('Invalid TOON format: Missing "d" (data) array.');
        }

        const [fileName, width, height] = toonData.m || ['image.jpg', 0, 0];
        const categoryNames = toonData.c || [];
        const data = toonData.d || [];

        const categories = categoryNames.map((name, idx) => ({
            id: idx + 1,
            name
        }));

        const annotations = data.map((item, idx) => {
            const [catIdx, points] = item;

            if (!Array.isArray(points)) {
                console.warn(`Skipping invalid annotation at index ${idx}: Points is not an array`);
                return null;
            }

            // Calculate bbox
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < points.length; i += 2) {
                minX = Math.min(minX, points[i]);
                maxX = Math.max(maxX, points[i]);
                minY = Math.min(minY, points[i + 1]);
                maxY = Math.max(maxY, points[i + 1]);
            }

            return {
                id: idx + 1,
                image_id: 1,
                category_id: catIdx + 1, // TOON uses 0-indexed, COCO uses 1-indexed
                segmentation: [points],
                bbox: [minX, minY, maxX - minX, maxY - minY],
                area: (maxX - minX) * (maxY - minY),
                iscrowd: 0
            };
        }).filter(a => a !== null);

        return {
            images: [{
                id: 1,
                file_name: fileName,
                width,
                height
            }],
            annotations,
            categories
        };
    }

    // ============================================
    // YOLO FORMAT
    // ============================================

    /**
     * Convert YOLO format to COCO
     * @param {string} yoloText - YOLO label file content
     * @param {number} imageWidth - Image width in pixels
     * @param {number} imageHeight - Image height in pixels
     * @param {Array} classNames - Array of class names (index = class_id)
     * @returns {Object} COCO-compliant object
     */
    static yoloToCoco(yoloText, imageWidth, imageHeight, classNames = []) {
        if (typeof yoloText !== 'string') {
            throw new Error('Invalid input: YOLO content must be a string.');
        }

        const lines = yoloText.trim().split('\n').filter(l => l.trim());

        // Basic YOLO Check: Look at first non-empty line
        if (lines.length > 0) {
            const parts = lines[0].trim().split(/\s+/);
            // Check if first part is a number (class_id) and we have at least 5 parts (id + 4 coords)
            if (parts.length < 5 || isNaN(parseFloat(parts[0]))) {
                throw new Error('Invalid YOLO format: Lines must start with class_id followed by coordinates.');
            }
        }

        const categoryMap = new Map();
        classNames.forEach((name, idx) => {
            categoryMap.set(idx, { id: idx + 1, name });
        });

        const annotations = lines.map((line, idx) => {
            const parts = line.trim().split(/\s+/);
            const classId = parseInt(parts[0]);

            if (isNaN(classId)) return null;

            const normalizedCoords = parts.slice(1).map(parseFloat);
            if (normalizedCoords.some(isNaN)) return null;

            // Denormalize coordinates
            const points = [];
            for (let i = 0; i < normalizedCoords.length; i += 2) {
                points.push(normalizedCoords[i] * imageWidth);
                points.push(normalizedCoords[i + 1] * imageHeight);
            }

            // Calculate bbox
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < points.length; i += 2) {
                minX = Math.min(minX, points[i]);
                maxX = Math.max(maxX, points[i]);
                minY = Math.min(minY, points[i + 1]);
                maxY = Math.max(maxY, points[i + 1]);
            }

            // Ensure class exists in map
            if (!categoryMap.has(classId)) {
                categoryMap.set(classId, { id: classId + 1, name: `class_${classId}` });
            }

            return {
                id: idx + 1,
                image_id: 1,
                category_id: classId + 1,
                segmentation: [points],
                bbox: [minX, minY, maxX - minX, maxY - minY],
                area: (maxX - minX) * (maxY - minY),
                iscrowd: 0
            };
        }).filter(a => a !== null);

        return {
            images: [{
                id: 1,
                file_name: 'image.jpg',
                width: imageWidth,
                height: imageHeight
            }],
            annotations,
            categories: Array.from(categoryMap.values()).sort((a, b) => a.id - b.id)
        };
    }

    /**
     * Convert COCO to YOLO format
     * @param {Object} cocoData - COCO-compliant object
     * @returns {Object} {txt: string, classes: Array}
     */
    static cocoToYolo(cocoData) {
        const image = cocoData.images?.[0] || {};
        const { width = 1, height = 1 } = image;

        // Build category map (id -> index for YOLO)
        const sortedCategories = [...(cocoData.categories || [])]
            .sort((a, b) => a.id - b.id);
        const catIdToYoloIdx = new Map();
        sortedCategories.forEach((cat, idx) => {
            catIdToYoloIdx.set(cat.id, idx);
        });

        const lines = (cocoData.annotations || []).map(ann => {
            const yoloClassId = catIdToYoloIdx.get(ann.category_id) ?? 0;
            const points = ann.segmentation?.[0] || [];

            // Normalize coordinates
            const normalizedParts = [];
            for (let i = 0; i < points.length; i += 2) {
                const nx = Math.max(0, Math.min(1, points[i] / width));
                const ny = Math.max(0, Math.min(1, points[i + 1] / height));
                normalizedParts.push(nx.toFixed(6));
                normalizedParts.push(ny.toFixed(6));
            }

            return `${yoloClassId} ${normalizedParts.join(' ')}`;
        });

        return {
            txt: lines.join('\n'),
            classes: sortedCategories.map(c => c.name)
        };
    }

    // ============================================
    // PASCAL VOC FORMAT
    // ============================================

    /**
     * Convert COCO to Pascal VOC XML format
     * Polygons are converted to bounding boxes (VOC doesn't support segmentation)
     * @param {Object} cocoData - COCO-compliant object
     * @returns {string} Pascal VOC XML string
     */
    static cocoToVoc(cocoData) {
        const image = cocoData.images?.[0] || {};
        const { file_name = 'image.jpg', width = 0, height = 0 } = image;

        // Build category id to name map
        const catIdToName = new Map();
        (cocoData.categories || []).forEach(cat => {
            catIdToName.set(cat.id, cat.name);
        });

        // Generate object elements
        const objectElements = (cocoData.annotations || []).map(ann => {
            const label = catIdToName.get(ann.category_id) || 'unknown';
            const points = ann.segmentation?.[0] || [];

            // Calculate bounding box from polygon points
            let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
            for (let i = 0; i < points.length; i += 2) {
                xmin = Math.min(xmin, points[i]);
                xmax = Math.max(xmax, points[i]);
                ymin = Math.min(ymin, points[i + 1]);
                ymax = Math.max(ymax, points[i + 1]);
            }

            // Clamp to image bounds
            xmin = Math.max(0, Math.round(xmin));
            ymin = Math.max(0, Math.round(ymin));
            xmax = Math.min(width, Math.round(xmax));
            ymax = Math.min(height, Math.round(ymax));

            return `  <object>
    <name>${escapeXml(label)}</name>
    <pose>Unspecified</pose>
    <truncated>0</truncated>
    <difficult>0</difficult>
    <bndbox>
      <xmin>${xmin}</xmin>
      <ymin>${ymin}</ymin>
      <xmax>${xmax}</xmax>
      <ymax>${ymax}</ymax>
    </bndbox>
  </object>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<annotation>
  <folder>images</folder>
  <filename>${escapeXml(file_name)}</filename>
  <size>
    <width>${width}</width>
    <height>${height}</height>
    <depth>3</depth>
  </size>
  <segmented>0</segmented>
${objectElements.join('\n')}
</annotation>`;
    }

    /**
     * Parse Pascal VOC XML to COCO format
     * @param {string} xmlString - VOC XML content
     * @param {number} imageWidth - Image width (override)
     * @param {number} imageHeight - Image height (override)
     * @returns {Object} COCO-compliant object
     */
    static vocToCoco(xmlString, imageWidth = null, imageHeight = null) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'text/xml');

        // Check for parse errors
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML format: ' + parseError.textContent);
        }

        const annotationNode = doc.querySelector('annotation');
        if (!annotationNode) {
            throw new Error('Invalid Pascal VOC format: Missing <annotation> root element.');
        }

        const filename = doc.querySelector('filename')?.textContent || 'image.jpg';
        const width = imageWidth || parseInt(doc.querySelector('size > width')?.textContent) || 0;
        const height = imageHeight || parseInt(doc.querySelector('size > height')?.textContent) || 0;

        const categoryMap = new Map();
        const annotations = [];

        const objects = doc.querySelectorAll('object');
        objects.forEach((obj, idx) => {
            const name = obj.querySelector('name')?.textContent || 'unknown';

            // Ensure category exists
            if (!categoryMap.has(name)) {
                categoryMap.set(name, categoryMap.size + 1);
            }

            const bndbox = obj.querySelector('bndbox');
            const xmin = parseFloat(bndbox?.querySelector('xmin')?.textContent) || 0;
            const ymin = parseFloat(bndbox?.querySelector('ymin')?.textContent) || 0;
            const xmax = parseFloat(bndbox?.querySelector('xmax')?.textContent) || 0;
            const ymax = parseFloat(bndbox?.querySelector('ymax')?.textContent) || 0;

            // Convert bbox to polygon (4 corner points)
            const points = [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax];

            annotations.push({
                id: idx + 1,
                image_id: 1,
                category_id: categoryMap.get(name),
                segmentation: [points],
                bbox: [xmin, ymin, xmax - xmin, ymax - ymin],
                area: (xmax - xmin) * (ymax - ymin),
                iscrowd: 0
            });
        });

        return {
            images: [{
                id: 1,
                file_name: filename,
                width,
                height
            }],
            annotations,
            categories: Array.from(categoryMap.entries()).map(([name, id]) => ({ id, name }))
        };
    }

    // ============================================
    // DIRECT INTERNAL STATE CONVERTERS
    // ============================================

    /**
     * Convert internal state directly to TOON for saving
     */
    static internalToToon(annotations, imageInfo) {
        const coco = this.internalToCoco(annotations, imageInfo);
        return this.cocoToToon(coco);
    }

    /**
     * Convert TOON directly to internal state for loading
     */
    static toonToInternal(toonData) {
        const coco = this.toonToCoco(toonData);
        return this.cocoToInternal(coco);
    }
}

// Helper: Escape XML special characters
function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export default AnnotationConverter;
export { AnnotationConverter };
