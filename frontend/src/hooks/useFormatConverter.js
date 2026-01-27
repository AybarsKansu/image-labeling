import { useCallback } from 'react';
import * as turf from '@turf/turf';

/**
 * useFormatConverter
 * The "Universal Aggregator" Engine.
 * Handles 1 File <-> N Images operations.
 */
export const useFormatConverter = () => {

    // ============================================
    // PARSERS (Import)
    // ============================================

    const parseAnnotations = useCallback(async (fileContent, fileName) => {
        // 1. Detect Format
        let format = 'unknown';
        if (fileName.endsWith('.json')) format = 'json';
        else if (fileName.endsWith('.xml')) format = 'xml';
        else if (fileName.endsWith('.txt')) format = 'txt';

        if (format === 'unknown') return { success: false, error: 'Unsupported file type' };

        try {
            if (format === 'txt') return parseYoloAggregated(fileContent);
            if (format === 'xml') return parseVocAggregated(fileContent);
            if (format === 'json') return parseJsonFormats(fileContent); // COCO or Toon
        } catch (err) {
            console.error(err);
            return { success: false, error: 'Parsing failed: ' + err.message };
        }
    }, []);

    // --- YOLO Aggregated (Manifest Style) ---
    // relative_path/image_name.jpg class_id x y w h
    const parseYoloAggregated = (text) => {
        const result = {}; // { fileName: [anns] }
        const lines = text.split('\n');

        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 6) return;

            // Detect where the numbers start (class_id x y w h)
            // The filename might contain spaces, so we look for the first number-like sequence from the end?
            // Standard YOLO Aggregated usually has filename as first token if no spaces.
            // Let's assume filename is the first token for now.
            // Or better: filename class x y w h (5 numbers at end)

            // Heuristic: Last 5 parts are class, x, y, w, h
            if (parts.length < 6) return;

            const h = parseFloat(parts.pop());
            const w = parseFloat(parts.pop());
            const y = parseFloat(parts.pop());
            const x = parseFloat(parts.pop());
            const classId = parseInt(parts.pop());
            const fileName = parts.join(' '); // Remainder is filename

            if (!result[fileName]) result[fileName] = [];

            result[fileName].push({
                classId, x, y, w, h,
                type: 'box',
                label: `Class ${classId}` // Will need classMap to resolve later
            });
        });

        return { success: true, data: result, format: 'yolo_agg' };
    };

    // --- VOC Aggregated (XML) ---
    // <Dataset><Annotation><Filename>...</Filename>... </Annotation> ... </Dataset>
    const parseVocAggregated = (xmlText) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const result = {};

        // Support both single <annotation> root (standard VOC) and custom <dataset> root
        const annotations = xmlDoc.getElementsByTagName('annotation'); // Finds all descendants

        for (let i = 0; i < annotations.length; i++) {
            const node = annotations[i];
            const fileNameNode = node.getElementsByTagName('filename')[0];
            if (!fileNameNode) continue;

            const fileName = fileNameNode.textContent;
            if (!result[fileName]) result[fileName] = [];

            const objects = node.getElementsByTagName('object');
            for (let j = 0; j < objects.length; j++) {
                const obj = objects[j];
                const name = obj.getElementsByTagName('name')[0]?.textContent || 'unknown';
                const bndbox = obj.getElementsByTagName('bndbox')[0];

                if (bndbox) {
                    const xmin = parseFloat(bndbox.getElementsByTagName('xmin')[0]?.textContent);
                    const ymin = parseFloat(bndbox.getElementsByTagName('ymin')[0]?.textContent);
                    const xmax = parseFloat(bndbox.getElementsByTagName('xmax')[0]?.textContent);
                    const ymax = parseFloat(bndbox.getElementsByTagName('ymax')[0]?.textContent);

                    // Convert to internal format (x, y, w, h are usually expected denormalized here)
                    // Internal format depends on system, but usually we use x,y (top-left) + w,h
                    result[fileName].push({
                        label: name,
                        x: xmin,
                        y: ymin,
                        w: xmax - xmin,
                        h: ymax - ymin,
                        type: 'box',
                        points: [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax]
                    });
                }
            }
        }

        return { success: true, data: result, format: 'voc_agg' };
    };

    // --- JSON Formats (COCO / Toon) ---
    const parseJsonFormats = (text) => {
        const json = JSON.parse(text);

        // Check Metadata to distinguish
        if (json.info && json.licenses && json.images && json.annotations) {
            return parseCoco(json);
        } else if (json.meta && json.data) {
            // Our "Snapshot" format or Toon? User called Snapshot format logic "Project Snapshot".
            // Assuming Toon is different. For now support standard COCO and Snapshot.
            return parseSnapshot(json);
        } else if (json.toon_version) { // Hypothetical check
            return parseToon(json);
        }

        // Fallback: Check structure
        if (Array.isArray(json)) {
            // Might be a simple list of objects
            return { success: false, error: 'Unknown JSON Array format' };
        }

        return parseCoco(json); // Default to COCO attempts
    };

    const parseCoco = (json) => {
        const result = {};
        const imgMap = {}; // id -> filename

        json.images.forEach(img => {
            imgMap[img.id] = img.file_name;
            result[img.file_name] = [];
        });

        json.annotations.forEach(ann => {
            const fileName = imgMap[ann.image_id];
            if (!fileName) return;

            // COCO bbox: [x, y, width, height]
            const [x, y, w, h] = ann.bbox;

            result[fileName].push({
                label: 'unknown', // COCO categories need mapping, skipping for brevity
                classId: ann.category_id,
                x, y, w, h,
                type: 'box',
                points: ann.segmentation ? (Array.isArray(ann.segmentation[0]) ? ann.segmentation[0] : ann.segmentation) : null
            });
            // Improve: Resolve Category ID to Name using json.categories
            if (json.categories) {
                const cat = json.categories.find(c => c.id === ann.category_id);
                if (cat) result[fileName][result[fileName].length - 1].label = cat.name;
            }
        });

        return { success: true, data: result, format: 'coco' };
    };

    const parseSnapshot = (json) => {
        // { meta: ..., data: [{ fileName, labels }] }
        const result = {};
        json.data.forEach(item => {
            result[item.fileName] = item.labels;
        });
        return { success: true, data: result, format: 'snapshot' };
    };

    // ============================================
    // GENERATORS (Export)
    // ============================================

    const generateAnnotations = useCallback((files, format) => {
        // Files is array of { name, label_data, width, height ... }
        // Note: label_data is internal string or object? 
        // In this system `label_data` in DB is raw YOLO string. 
        // We probably need to parse that first OR rely on `annotations` if provided directly.
        // Assuming `files` includes parsed `annotations` or we parse on the fly.

        switch (format) {
            case 'yolo':
            case 'yolo_agg': return generateYoloAgg(files);
            case 'voc':
            case 'voc_agg': return generateVocAgg(files);
            case 'coco': return generateCoco(files);
            case 'toon': return generateToon(files);
            default: throw new Error(`Unsupported export format: ${format}`);
        }
    }, []);

    const generateYoloAgg = (files) => {
        // Output: filename class_id x_center y_center w h
        let output = '';
        files.forEach(file => {
            const anns = file.annotations || []; // Assuming parsed
            anns.forEach(ann => {
                // Determine values (Assuming normalized if raw, or denormalized if parsed)
                // Internal `annotations` state is usually denormalized (pixels).
                // YOLO needs normalized.
                if (!file.width || !file.height) return;

                let cx, cy, w, h;

                if (ann.type === 'box' || (ann.points && ann.points.length >= 4)) {
                    // Calculate bbox from points if needed
                    const pts = ann.points || [ann.x, ann.y, ann.x + ann.w, ann.y, ann.x + ann.w, ann.y + ann.h, ann.x, ann.y + ann.h];
                    const xs = pts.filter((_, i) => i % 2 === 0);
                    const ys = pts.filter((_, i) => i % 2 === 1);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    const bw = maxX - minX;
                    const bh = maxY - minY;

                    cx = (minX + bw / 2) / file.width;
                    cy = (minY + bh / 2) / file.height;
                    w = bw / file.width;
                    h = bh / file.height;
                }

                // ClassId
                const cid = ann.classId !== undefined ? ann.classId : 0;
                output += `${file.name} ${cid} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}\n`;
            });
        });
        return { data: output, mime: 'text/plain', ext: 'txt' };
    };

    const generateVocAgg = (files) => {
        let xml = '<dataset>\n';
        files.forEach(file => {
            if (!file.annotations || file.annotations.length === 0) return;

            xml += `  <annotation>\n`;
            xml += `    <filename>${file.name}</filename>\n`;
            xml += `    <size>\n`;
            xml += `      <width>${file.width}</width>\n`;
            xml += `      <height>${file.height}</height>\n`;
            xml += `      <depth>3</depth>\n`;
            xml += `    </size>\n`;

            file.annotations.forEach(ann => {
                // Denormalized bbox
                // If stored normalized, need to multiply. Assuming internal is pixels (from logic above).
                // Just calculating bbox again to be safe.
                const pts = ann.points;
                if (!pts) return;
                const xs = pts.filter((_, i) => i % 2 === 0);
                const ys = pts.filter((_, i) => i % 2 === 1);
                const xmin = Math.min(...xs);
                const xmax = Math.max(...xs);
                const ymin = Math.min(...ys);
                const ymax = Math.max(...ys);

                xml += `    <object>\n`;
                xml += `      <name>${ann.label || 'object'}</name>\n`;
                xml += `      <bndbox>\n`;
                xml += `        <xmin>${Math.round(xmin)}</xmin>\n`;
                xml += `        <ymin>${Math.round(ymin)}</ymin>\n`;
                xml += `        <xmax>${Math.round(xmax)}</xmax>\n`;
                xml += `        <ymax>${Math.round(ymax)}</ymax>\n`;
                xml += `      </bndbox>\n`;
                xml += `    </object>\n`;
            });

            xml += `  </annotation>\n`;
        });
        xml += '</dataset>';
        return { data: xml, mime: 'application/xml', ext: 'xml' };
    };

    const generateCoco = (files) => {
        const json = {
            images: [],
            annotations: [],
            categories: []
        };

        const catMap = new Map();
        let annId = 1;

        files.forEach((file, fIdx) => {
            const imgId = fIdx + 1;
            json.images.push({
                id: imgId,
                file_name: file.name,
                width: file.width,
                height: file.height
            });

            if (!file.annotations) return;
            file.annotations.forEach(ann => {
                const label = ann.label || 'object';
                if (!catMap.has(label)) {
                    catMap.set(label, catMap.size + 1);
                    json.categories.push({ id: catMap.get(label), name: label });
                }

                // COCO Bbox [x,y,w,h] (top-left) values denormalized
                const pts = ann.points || [];
                const xs = pts.filter((_, i) => i % 2 === 0);
                const ys = pts.filter((_, i) => i % 2 === 1);
                const xmin = Math.min(...xs);
                const xmax = Math.max(...xs);
                const ymin = Math.min(...ys);
                const ymax = Math.max(...ys);
                const w = xmax - xmin;
                const h = ymax - ymin;

                json.annotations.push({
                    id: annId++,
                    image_id: imgId,
                    category_id: catMap.get(label),
                    bbox: [xmin, ymin, w, h],
                    segmentation: [pts],
                    area: w * h,
                    iscrowd: 0
                });
            });
        });

        return { data: JSON.stringify(json, null, 2), mime: 'application/json', ext: 'json' };
    };

    // Toon Schema (Hypothetical, simple)
    const generateToon = (files) => {
        const data = files.map(f => ({
            filename: f.name,
            objects: (f.annotations || []).map(a => ({
                class: a.label,
                box: a.points // Simplification
            }))
        }));
        const json = { toon_version: "1.0", data };
        return { data: JSON.stringify(json, null, 2), mime: 'application/json', ext: 'json' };
    };

    return {
        parseAnnotations,
        generateAnnotations
    };
};
