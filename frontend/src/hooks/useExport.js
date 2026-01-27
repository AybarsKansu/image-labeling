import { useCallback } from 'react';
import JSZip from 'jszip';
import db from '../db/index';
import { useFormatConverter } from './useFormatConverter';
import { useFileSystem } from './useFileSystem';

export const useExport = () => {
    const { generateAnnotations } = useFormatConverter();
    const { activeFileData } = useFileSystem();

    /**
     * Export the entire project as a ZIP file
     * @param {string} format - 'yolo', 'coco', 'voc', 'toon'
     */
    const exportProject = useCallback(async (format) => {
        try {
            const files = await db.files.toArray();
            if (files.length === 0) throw new Error("No files to export.");

            const zip = new JSZip();
            const imagesFolder = zip.folder("images");
            const labelsFolder = zip.folder("labels"); // For YOLO mainly

            // Prepare data for converter
            const imagesData = [];
            const classesSet = new Set();

            // 1. Process files and add images to ZIP
            for (const file of files) {
                if (!file.blob) continue;

                // Add image to zip
                // Clean filename
                const imgName = file.name;
                imagesFolder.file(imgName, file.blob);

                // Prepare annotation data
                let annotations = [];
                if (file.label_data) {
                    // We need to parse the label data back to internal format
                    // Since useFormatConverter expects internal format for 'generateAnnotations'
                    // We can reuse the logic from useFileSystem or duplicated here.
                    // Ideally we should have a shared utility. 
                    // For now, let's use a simple parser or if available from file.
                    // But wait, file.label_data is the persisted TOON/YOLO-ish string.
                    // Let's assume we need to parse it back.
                    // ACTUALLY: The best way is to use AnnotationConverter.toonToInternal if it's TOON (which we save as)
                    // But in useFileSystem we save as "YOLO-ish" serialization?
                    // Let's check useFileSystem: it persists `label_data` via `serializeAnnotations` which does YOLO format + `# classes:` metadata.
                    // So we need to parse that YOLO format back to internal.

                    annotations = parseSerialization(file.label_data, file.width, file.height);

                    // Collect classes
                    annotations.forEach(ann => classesSet.add(ann.label));
                }

                imagesData.push({
                    file: {
                        name: imgName,
                        width: file.width || 800,
                        height: file.height || 600
                    },
                    annotations
                });
            }

            const allClasses = Array.from(classesSet).sort();

            // 2. Generate Annotations based on Format
            if (format === 'yolo') {
                // Generate individual txt files
                // We can use generateAnnotations ('yolo') but that usually generates ONE file or we need a loop.
                // The 'useFormatConverter' -> generateAnnotations returns a single content usually?
                // check useFormatConverter: 'yolo' -> generateAggregatedYolo
                // Wait, standard YOLO is one txt per image.
                // Let's implement specific logic here for Zip-based YOLO export since common tool is single-file.

                // data.yaml
                const yamlContent = [
                    `train: ../images`,
                    `val: ../images`,
                    `nc: ${allClasses.length}`,
                    `names: [${allClasses.map(c => `'${c}'`).join(', ')}]`
                ].join('\n');
                zip.file("data.yaml", yamlContent);

                // Labels
                imagesData.forEach(item => {
                    const txtName = item.file.name.replace(/\.[^/.]+$/, "") + ".txt";
                    const lines = item.annotations.map(ann => {
                        const cid = allClasses.indexOf(ann.label);
                        if (cid === -1) return null;

                        // Internal is abs coords, YOLO needs normalized center
                        const w = item.file.width || 1;
                        const h = item.file.height || 1;

                        if (ann.type === 'box') {
                            const nx = (ann.x + ann.w / 2) / w;
                            const ny = (ann.y + ann.h / 2) / h;
                            const nw = ann.w / w;
                            const nh = ann.h / h;
                            return `${cid} ${nx.toFixed(6)} ${ny.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}`;
                        } else if (ann.type === 'poly') {
                            const pts = ann.points.map((p, i) =>
                                (i % 2 === 0 ? p / w : p / h).toFixed(6)
                            ).join(' ');
                            return `${cid} ${pts}`;
                        }
                        return null;
                    }).filter(l => l);

                    if (lines.length > 0) {
                        labelsFolder.file(txtName, lines.join('\n'));
                    }
                });

            } else if (format === 'coco') {
                const { content } = generateAnnotations(imagesData, 'coco');
                zip.file("annotations.json", content);
            } else if (format === 'voc') {
                // VOC is usually one XML per image
                imagesData.forEach(item => {
                    // We can cheat and use useFormatConverter logic if it supported single file generation, 
                    // but likely it generates aggregated.
                    // Let's do a simple loop using the converter if possible or manual.
                    // Re-using the converter for aggregated is fine if we want one big xml? No VOC is usually per file.
                    // Let's manually generate XML here for simplicity and correctness in ZIP context.

                    const xml = generateVocXml(item);
                    const xmlName = item.file.name.replace(/\.[^/.]+$/, "") + ".xml";
                    zip.file(xmlName, xml);
                });
            } else if (format === 'toon') {
                // Custom JSON per file
                imagesData.forEach(item => {
                    const toon = generateToonJson(item);
                    const jsonName = item.file.name.replace(/\.[^/.]+$/, "") + ".json";
                    zip.file(jsonName, JSON.stringify(toon, null, 2));
                });
            } else {
                throw new Error("Unsupported format for zip export");
            }

            // 3. Generate Zip Blob
            const content = await zip.generateAsync({ type: "blob" });

            // 4. Download
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `dataset_${format}_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return { success: true, count: files.length };

        } catch (err) {
            console.error(err);
            throw err;
        }
    }, [generateAnnotations]);

    return { exportProject };
};

// --- Helpers ---

// Re-parser for stored label data (YOLO-ish + metadata)
function parseSerialization(labelData, w, h) {
    if (!labelData) return [];

    // If it's already a TOON object (has version 'v'), decode it
    if (typeof labelData === 'object' && labelData.v) {
        // We need to access AnnotationConverter to decode TOON. 
        // Best way is to pass it or move this helper inside the hook where module is loaded?
        // Actually, we can just mirror the logic for simple TOON or assume caller handles it.
        // BUT caller is 'useExport' and valid format is 'd' array.
        // Let's manually parse TOON 'd' here to keep it self-contained or use the one from utils if imported.
        // Since we can't easily import class inside function, let's decode TOON manually here.

        const data = labelData.d || [];
        const categories = labelData.c || [];

        return data.map((item, idx) => {
            const [catIdx, pts] = item;
            const label = categories[catIdx] || `class_${catIdx}`;

            // Box or Poly? Points usually [x,y,x,y...]
            // If 4 points and rectangle logic -> Box?
            // TOON usually stores polygons. 
            // We can assume Poly for all and let Box logic infer?
            // Or detect if 8 points and rectangular.

            // For now return as Poly, but with box data attached if needed?
            // Actually Internal format uses 'type'.
            // Toon points are [x,y...].

            return {
                id: idx,
                type: 'poly',
                label: label,
                points: pts
            };
        });
    }

    // Ensure string
    const dataStr = typeof labelData === 'string' ? labelData : JSON.stringify(labelData);
    const lines = dataStr.split('\n');

    // Extract classes from metadata if present
    let localClasses = [];
    const metaMatch = lines.find(l => /^#\s*classes?:\s*(.+)$/i.test(l));
    if (metaMatch) {
        const match = metaMatch.match(/^#\s*classes?:\s*(.+)$/i);
        if (match) {
            localClasses = match[1].split(',').map(c => c.trim()).filter(c => c);
        }
    }

    return lines.map((line, idx) => {
        if (line.startsWith('#') || !line.trim()) return null;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;

        const cid = parseInt(parts[0]);
        // Use local embedded class name or fallback
        const label = localClasses[cid] || `class_${cid}`;

        if (parts.length === 5) {
            // Box
            const nx = parseFloat(parts[1]);
            const ny = parseFloat(parts[2]);
            const nw = parseFloat(parts[3]);
            const nh = parseFloat(parts[4]);

            const absW = nw * w;
            const absH = nh * h;
            const absX = (nx * w) - (absW / 2);
            const absY = (ny * h) - (absH / 2);

            return {
                id: idx, type: 'box', label,
                x: absX, y: absY, w: absW, h: absH,
                points: [absX, absY, absX + absW, absY, absX + absW, absY + absH, absX, absY + absH]
            };
        } else {
            // Poly
            const points = [];
            for (let i = 1; i < parts.length; i += 2) {
                points.push(parseFloat(parts[i]) * w);
                points.push(parseFloat(parts[i + 1]) * h);
            }
            return { id: idx, type: 'poly', label, points };
        }
    }).filter(Boolean);
}

function generateVocXml(item) {
    const { file, annotations } = item;
    let xml = `<annotation>
    <folder>images</folder>
    <filename>${file.name}</filename>
    <size>
        <width>${file.width}</width>
        <height>${file.height}</height>
        <depth>3</depth>
    </size>
`;
    annotations.forEach(ann => {
        let xmin, ymin, xmax, ymax;
        if (ann.type === 'box') {
            xmin = ann.x; ymin = ann.y;
            xmax = ann.x + ann.w; ymax = ann.y + ann.h;
        } else {
            const xs = ann.points.filter((_, i) => i % 2 === 0);
            const ys = ann.points.filter((_, i) => i % 2 === 1);
            xmin = Math.min(...xs); xmax = Math.max(...xs);
            ymin = Math.min(...ys); ymax = Math.max(...ys);
        }

        xml += `    <object>
        <name>${ann.label}</name>
        <bndbox>
            <xmin>${Math.round(xmin)}</xmin>
            <ymin>${Math.round(ymin)}</ymin>
            <xmax>${Math.round(xmax)}</xmax>
            <ymax>${Math.round(ymax)}</ymax>
        </bndbox>
    </object>
`;
    });
    xml += `</annotation>`;
    return xml;
}

function generateToonJson(item) {
    // Mimic the TOON format from annotationConverter
    const { file, annotations } = item;

    // Collect class map
    const clsMap = new Map();
    annotations.forEach(a => {
        if (!clsMap.has(a.label)) clsMap.set(a.label, clsMap.size);
    });

    const d = annotations.map(ann => {
        const cid = clsMap.get(ann.label);
        let pts = ann.points;
        return [cid, pts];
    });

    return {
        v: "1.0",
        m: [file.name, file.width, file.height],
        c: Array.from(clsMap.keys()),
        d
    };
}
