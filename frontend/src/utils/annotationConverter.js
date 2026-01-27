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
            const label = (ann.label !== null && ann.label !== undefined) ? ann.label : 'unknown';
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
            // Preserve empty strings, only default if null/undefined
            const label = (ann.label !== null && ann.label !== undefined) ? ann.label : 'unknown';

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
        let extractedClasses = [...classNames];

        // Check for metadata line (# classes: ...)
        const metadataLine = lines.find(l => l.startsWith('# classes:'));
        if (metadataLine) {
            try {
                const classString = metadataLine.replace('# classes:', '').trim();
                if (classString) {
                    // Extract classes preserving split
                    extractedClasses = classString.split(',').map(c => c.trim());
                }
            } catch (e) {
                console.warn('Failed to parse classes metadata', e);
            }
        }

        // Filter out comment lines for validation and parsing
        const validLines = lines.filter(l => !l.startsWith('#'));

        // Basic YOLO Check: Look at first non-empty line
        if (validLines.length > 0) {
            const parts = validLines[0].trim().split(/\s+/);
            // Check if first part is a number (class_id) and we have at least 5 parts (id + 4 coords)
            if (parts.length < 5 || isNaN(parseFloat(parts[0]))) {
                throw new Error('Invalid YOLO format: Lines must start with class_id followed by coordinates.');
            }
        }

        const categoryMap = new Map();
        // Populate category map from extracted classes (or passed default)
        extractedClasses.forEach((name, idx) => {
            categoryMap.set(idx, { id: idx + 1, name });
        });

        const annotations = validLines.map((line, idx) => {
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
                category_id: classId + 1, // COCO uses 1-indexed categories
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

        // Add metadata comment for re-importing
        const classNames = sortedCategories.map(c => c.name).join(', ');
        lines.push(`# classes: ${classNames}`);

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

    // ============================================
    // FORMAT AUTO-DETECTION
    // ============================================

    /**
     * Detect annotation format from file content
     * @param {string} content - Raw file content
     * @returns {string} Format type: 'coco' | 'toon' | 'voc' | 'voc-aggregated' | 'yolo' | 'yolo-aggregated' | 'unknown'
     */
    static detectFormat(content) {
        const trimmed = content.trim();

        // Check for XML formats
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
            if (trimmed.includes('<Dataset>') || trimmed.includes('<dataset>')) {
                return 'voc-aggregated';
            }
            if (trimmed.includes('<annotation>') || trimmed.includes('<Annotation>')) {
                return 'voc';
            }
            return 'unknown';
        }

        // Check for JSON formats
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const json = JSON.parse(trimmed);
                // TOON format check
                if (json.v && json.d && json.c) {
                    // Check if multi-image TOON
                    if (Array.isArray(json.images)) return 'toon-batch';
                    return 'toon';
                }
                // COCO format check
                if (json.images && json.annotations && json.categories) {
                    return 'coco';
                }
                return 'unknown';
            } catch {
                return 'unknown';
            }
        }

        // Check for YOLO text formats
        const lines = trimmed.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        if (lines.length > 0) {
            const firstLine = lines[0].trim();
            const parts = firstLine.split(/\s+/);
            const firstToken = parts[0];

            // Standard YOLO: starts with class_id (integer)
            // e.g. "0 0.5 0.5 0.2 0.2"
            if (!isNaN(parseInt(firstToken)) && String(parseInt(firstToken)) === firstToken && parts.length >= 5) {
                return 'yolo';
            }

            // Aggregated YOLO: first part contains path separator (/) or file extension, IS NOT a pure number
            // e.g. "image.jpg 0 0.1 0.1..." or "data/img.png 1 ..."
            if (isNaN(parseInt(firstToken)) && (firstToken.includes('/') || firstToken.includes('.'))) {
                return 'yolo-aggregated';
            }
        }

        return 'unknown';
    }

    // ============================================
    // AGGREGATED YOLO (Manifest Style)
    // ============================================

    /**
     * Parse Aggregated YOLO manifest format
     * Format: relative_path/image.jpg class_id x_center y_center width height ...
     * @param {string} yoloText - Manifest style YOLO content
     * @param {Array} projectImages - Array of {name, width, height} for project images
     * @returns {Object} { annotations: {'image_name': [anns]}, categories: [], orphans: [] }
     */
    static parseAggregatedYolo(yoloText, projectImages = []) {
        if (typeof yoloText !== 'string') {
            throw new Error('Invalid input: YOLO content must be a string.');
        }

        const lines = yoloText.trim().split('\n');
        const annotations = {};
        const orphans = [];
        let classNames = [];

        // Build image lookup by name
        const imageMap = new Map();
        projectImages.forEach(img => {
            const name = img.name || img.file_name;
            imageMap.set(name, { width: img.width || 1, height: img.height || 1 });
        });

        // Extract class names from metadata comment
        const metadataLine = lines.find(l => l.startsWith('# classes:'));
        if (metadataLine) {
            classNames = metadataLine.replace('# classes:', '').trim().split(',').map(c => c.trim());
        }

        // Parse annotation lines
        lines.filter(l => l.trim() && !l.startsWith('#')).forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 6) return; // Need at least: path class_id x y w h

            // Extract image path/name from first part
            const imagePath = parts[0];
            const imageName = imagePath.split('/').pop(); // Get filename from path
            const classId = parseInt(parts[1]);
            const coords = parts.slice(2).map(parseFloat);

            if (isNaN(classId) || coords.some(isNaN)) return;

            // Check if image exists in project
            const imageInfo = imageMap.get(imageName);
            if (!imageInfo) {
                if (!orphans.includes(imageName)) {
                    orphans.push(imageName);
                    console.warn(`[FormatConverter] Skipping orphan annotations for: ${imageName}`);
                }
                return;
            }

            // Initialize annotation array for this image
            if (!annotations[imageName]) {
                annotations[imageName] = [];
            }

            // Denormalize coordinates
            const { width, height } = imageInfo;
            const points = [];
            for (let i = 0; i < coords.length; i += 2) {
                points.push(coords[i] * width);
                points.push(coords[i + 1] * height);
            }

            // Get class name
            const label = classNames[classId] || `class_${classId}`;

            annotations[imageName].push({
                id: `${imageName}_${annotations[imageName].length}`,
                type: 'poly',
                label,
                points,
                originalRawPoints: points
            });
        });

        return { annotations, categories: classNames, orphans };
    }

    /**
     * Generate Aggregated YOLO manifest format
     * @param {Array} imagesData - Array of { file: {name, width, height}, annotations: [] }
     * @returns {string} Manifest YOLO text content
     */
    static generateAggregatedYolo(imagesData) {
        // Build global category list from all annotations
        const categorySet = new Set();
        imagesData.forEach(({ annotations }) => {
            annotations.forEach(ann => {
                if (ann.label) categorySet.add(ann.label);
            });
        });
        const categories = Array.from(categorySet);
        const catToIdx = new Map(categories.map((c, i) => [c, i]));

        const lines = [];

        imagesData.forEach(({ file, annotations }) => {
            const { name, width = 1, height = 1 } = file;

            annotations.forEach(ann => {
                const classIdx = catToIdx.get(ann.label) ?? 0;
                const points = ann.points || [];

                // Normalize coordinates
                const normalizedParts = [];
                for (let i = 0; i < points.length; i += 2) {
                    const nx = Math.max(0, Math.min(1, points[i] / width));
                    const ny = Math.max(0, Math.min(1, points[i + 1] / height));
                    normalizedParts.push(nx.toFixed(6));
                    normalizedParts.push(ny.toFixed(6));
                }

                lines.push(`${name} ${classIdx} ${normalizedParts.join(' ')}`);
            });
        });

        // Add classes metadata
        if (categories.length > 0) {
            lines.push(`# classes: ${categories.join(', ')}`);
        }

        return lines.join('\n');
    }

    // ============================================
    // AGGREGATED PASCAL VOC
    // ============================================

    /**
     * Parse Aggregated Pascal VOC XML
     * @param {string} xmlString - Aggregated VOC XML with <Dataset> root
     * @param {Array} projectImages - Array of {name, width, height}
     * @returns {Object} { annotations: {'image_name': [anns]}, categories: [], orphans: [] }
     */
    static parseAggregatedVoc(xmlString, projectImages = []) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'text/xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML format: ' + parseError.textContent);
        }

        // Build image lookup
        const imageMap = new Map();
        projectImages.forEach(img => {
            const name = img.name || img.file_name;
            imageMap.set(name, { width: img.width || 0, height: img.height || 0 });
        });

        const annotations = {};
        const orphans = [];
        const categorySet = new Set();

        // Find all Annotation nodes (case-insensitive)
        const annotationNodes = doc.querySelectorAll('Annotation, annotation');

        annotationNodes.forEach(annNode => {
            const filename = annNode.querySelector('filename')?.textContent ||
                annNode.querySelector('Filename')?.textContent || '';

            if (!filename) return;

            // Check if image exists in project
            if (!imageMap.has(filename)) {
                if (!orphans.includes(filename)) {
                    orphans.push(filename);
                    console.warn(`[FormatConverter] Skipping orphan annotations for: ${filename}`);
                }
                return;
            }

            const imgInfo = imageMap.get(filename);
            if (!annotations[filename]) {
                annotations[filename] = [];
            }

            // Parse objects
            const objects = annNode.querySelectorAll('object');
            objects.forEach((obj, idx) => {
                const name = obj.querySelector('name')?.textContent || 'unknown';
                categorySet.add(name);

                const bndbox = obj.querySelector('bndbox');
                const xmin = parseFloat(bndbox?.querySelector('xmin')?.textContent) || 0;
                const ymin = parseFloat(bndbox?.querySelector('ymin')?.textContent) || 0;
                const xmax = parseFloat(bndbox?.querySelector('xmax')?.textContent) || 0;
                const ymax = parseFloat(bndbox?.querySelector('ymax')?.textContent) || 0;

                // Convert bbox to polygon (4 corners)
                const points = [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax];

                annotations[filename].push({
                    id: `${filename}_${idx}`,
                    type: 'poly',
                    label: name,
                    points,
                    originalRawPoints: points
                });
            });
        });

        return { annotations, categories: Array.from(categorySet), orphans };
    }

    /**
     * Generate Aggregated Pascal VOC XML
     * @param {Array} imagesData - Array of { file: {name, width, height}, annotations: [] }
     * @returns {string} Aggregated VOC XML content
     */
    static generateAggregatedVoc(imagesData) {
        const annotationElements = imagesData.map(({ file, annotations }) => {
            const { name, width = 0, height = 0 } = file;

            const objectElements = annotations.map(ann => {
                const points = ann.points || [];

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

                return `    <object>
      <name>${escapeXml(ann.label || 'unknown')}</name>
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

            return `  <Annotation>
    <folder>images</folder>
    <filename>${escapeXml(name)}</filename>
    <size>
      <width>${width}</width>
      <height>${height}</height>
      <depth>3</depth>
    </size>
    <segmented>0</segmented>
${objectElements.join('\n')}
  </Annotation>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<Dataset>
${annotationElements.join('\n')}
</Dataset>`;
    }

    // ============================================
    // BATCH COCO (Multi-Image)
    // ============================================

    /**
     * Parse batch COCO format (multiple images)
     * @param {Object} cocoData - COCO JSON with multiple images
     * @param {Array} projectImages - Array of {name, width, height}
     * @returns {Object} { annotations: {'image_name': [anns]}, categories: [], orphans: [] }
     */
    static parseBatchCoco(cocoData, projectImages = []) {
        if (!cocoData || typeof cocoData !== 'object') {
            throw new Error('Invalid COCO data');
        }

        // Build image lookup from project
        const projectImageMap = new Map();
        projectImages.forEach(img => {
            projectImageMap.set(img.name || img.file_name, img);
        });

        // Build image_id to filename map from COCO
        const imageIdToName = new Map();
        (cocoData.images || []).forEach(img => {
            imageIdToName.set(img.id, img.file_name);
        });

        // Build category id to name map
        const catIdToName = new Map();
        (cocoData.categories || []).forEach(cat => {
            catIdToName.set(cat.id, cat.name);
        });

        const annotations = {};
        const orphans = [];

        (cocoData.annotations || []).forEach(ann => {
            const imageName = imageIdToName.get(ann.image_id);
            if (!imageName) return;

            // Check if image exists in project
            if (!projectImageMap.has(imageName)) {
                if (!orphans.includes(imageName)) {
                    orphans.push(imageName);
                    console.warn(`[FormatConverter] Skipping orphan annotations for: ${imageName}`);
                }
                return;
            }

            if (!annotations[imageName]) {
                annotations[imageName] = [];
            }

            annotations[imageName].push({
                id: String(ann.id),
                type: 'poly',
                label: catIdToName.get(ann.category_id) || 'unknown',
                points: ann.segmentation?.[0] || [],
                originalRawPoints: ann.segmentation?.[0] || []
            });
        });

        return {
            annotations,
            categories: Array.from(catIdToName.values()),
            orphans
        };
    }

    /**
     * Generate batch COCO format (multiple images)
     * @param {Array} imagesData - Array of { file: {name, width, height}, annotations: [] }
     * @returns {Object} COCO JSON object
     */
    static generateBatchCoco(imagesData) {
        // Build global category map
        const categoryMap = new Map();
        imagesData.forEach(({ annotations }) => {
            annotations.forEach(ann => {
                const label = ann.label || 'unknown';
                if (!categoryMap.has(label)) {
                    categoryMap.set(label, categoryMap.size + 1);
                }
            });
        });

        const categories = Array.from(categoryMap.entries()).map(([name, id]) => ({ id, name }));
        const images = [];
        const cocoAnnotations = [];
        let annId = 1;

        imagesData.forEach(({ file, annotations }, imgIdx) => {
            const imageId = imgIdx + 1;
            images.push({
                id: imageId,
                file_name: file.name,
                width: file.width || 0,
                height: file.height || 0
            });

            annotations.forEach(ann => {
                const points = ann.points || [];

                // Calculate bbox
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (let i = 0; i < points.length; i += 2) {
                    minX = Math.min(minX, points[i]);
                    maxX = Math.max(maxX, points[i]);
                    minY = Math.min(minY, points[i + 1]);
                    maxY = Math.max(maxY, points[i + 1]);
                }

                cocoAnnotations.push({
                    id: annId++,
                    image_id: imageId,
                    category_id: categoryMap.get(ann.label || 'unknown'),
                    segmentation: [points],
                    bbox: [minX, minY, maxX - minX, maxY - minY],
                    area: (maxX - minX) * (maxY - minY),
                    iscrowd: 0
                });
            });
        });

        return { images, annotations: cocoAnnotations, categories };
    }

    // ============================================
    // BATCH TOON (Multi-Image)
    // ============================================

    /**
     * Parse batch TOON format (multiple images)
     * @param {Object} toonData - Multi-image TOON format
     * @param {Array} projectImages - Array of {name, width, height}
     * @returns {Object} { annotations: {'image_name': [anns]}, categories: [], orphans: [] }
     */
    static parseBatchToon(toonData, projectImages = []) {
        if (!toonData?.images || !Array.isArray(toonData.images)) {
            throw new Error('Invalid batch TOON format: Missing images array');
        }

        // Build project image lookup
        const projectImageMap = new Map();
        projectImages.forEach(img => {
            projectImageMap.set(img.name || img.file_name, img);
        });

        const categories = toonData.c || [];
        const annotations = {};
        const orphans = [];

        toonData.images.forEach(imgData => {
            const [fileName, width, height] = imgData.m || ['image.jpg', 0, 0];
            const data = imgData.d || [];

            // Check if image exists in project
            if (!projectImageMap.has(fileName)) {
                if (!orphans.includes(fileName)) {
                    orphans.push(fileName);
                    console.warn(`[FormatConverter] Skipping orphan annotations for: ${fileName}`);
                }
                return;
            }

            annotations[fileName] = data.map((item, idx) => {
                const [catIdx, points] = item;
                return {
                    id: `${fileName}_${idx}`,
                    type: 'poly',
                    label: categories[catIdx] || 'unknown',
                    points: points || [],
                    originalRawPoints: points || []
                };
            });
        });

        return { annotations, categories, orphans };
    }

    /**
     * Generate batch TOON format (multiple images)
     * @param {Array} imagesData - Array of { file: {name, width, height}, annotations: [] }
     * @returns {Object} Batch TOON JSON object
     */
    static generateBatchToon(imagesData) {
        // Build global category list
        const categorySet = new Set();
        imagesData.forEach(({ annotations }) => {
            annotations.forEach(ann => {
                if (ann.label) categorySet.add(ann.label);
            });
        });
        const categories = Array.from(categorySet);
        const catToIdx = new Map(categories.map((c, i) => [c, i]));

        const images = imagesData.map(({ file, annotations }) => {
            const data = annotations.map(ann => {
                const catIdx = catToIdx.get(ann.label) ?? 0;
                const points = (ann.points || []).map(p => Math.round(p * 100) / 100);
                return [catIdx, points];
            });

            return {
                m: [file.name, file.width || 0, file.height || 0],
                d: data
            };
        });

        return {
            v: '1.0',
            c: categories,
            images
        };
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
