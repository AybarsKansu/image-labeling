
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import db from '../db/index';
import { getSetting } from '../db/fileOperations';
import { AnnotationConverter } from './annotationConverter';

// Helper to parse label data (reused from logic in useFileSystem, simplified)
function parseLabelData(labelData, classNames, imgWidth, imgHeight) {
    if (!labelData) return [];

    // Convert TOON to Internal
    if (typeof labelData === 'object' && labelData.v === '1.0') {
        // We can use AnnotationConverter logic directly if we assume it's loaded, 
        // but let's use the static method if available or implement simplified toon->internal
        return AnnotationConverter.toonToInternal(labelData).annotations;
    }
    // If it's pure string (YOLO/XML), we might need parsing, but usually it's stored as TOON in DB
    // or we might need to handle raw string if legacy.
    // For now assuming TOON as per system design.
    return [];
}

/**
 * Export Project as ZIP
 * Structure:
 * - classes.txt
 * - data.yaml
 * - images/
 * - labels/
 */
export async function exportProjectAsZip(projectId, projectName = 'project') {
    if (!projectId) throw new Error("Project ID is required");

    const zip = new JSZip();
    const imagesFolder = zip.folder("images");
    const labelsFolder = zip.folder("labels");

    // 1. Fetch all files for project
    const files = await db.files.where('project_id').equals(projectId).toArray();

    if (files.length === 0) {
        throw new Error("No files found in this project");
    }

    // 2. Determine Class Map
    // Try to get saved class names first to maintain order
    let projectClassNames = await getSetting('classNames') || [];

    // If no saved classes, or we want to be exhaustive, collect from all files
    // But usually the user wants the defined classes. 
    // Let's assume the saved `classNames` are the source of truth for ID mapping.
    // If a label exists in file but not in global map, append it.

    const uniqueLabels = new Set(projectClassNames);

    // First pass: Collect all labels to ensure comprehensive class list
    files.forEach(file => {
        if (!file.label_data) return;

        let annotations = [];
        try {
            // Need to parse to get raw labels
            // Handle TOON object vs string
            const data = typeof file.label_data === 'string' ? JSON.parse(file.label_data) : file.label_data;
            const internal = AnnotationConverter.toonToInternal(data);
            annotations = internal.annotations || [];

            annotations.forEach(ann => {
                if (ann.label) uniqueLabels.add(ann.label);
            });
        } catch (e) {
            // ignore parse errors for now
        }
    });

    // Final Class List (Array)
    const finalClassNames = Array.from(uniqueLabels);

    // 3. Process Files
    for (const file of files) {
        // Add Image
        if (file.blob) {
            imagesFolder.file(file.name, file.blob);
        }

        // Add Label (if exists)
        if (file.label_data) {
            try {
                // Parse TOON -> Internal
                const data = typeof file.label_data === 'string' ? JSON.parse(file.label_data) : file.label_data;
                const result = AnnotationConverter.toonToInternal(data);
                const annotations = result.annotations;

                if (annotations.length > 0) {
                    // Convert Internal -> COCO
                    const coco = AnnotationConverter.internalToCoco(annotations, {
                        name: file.name,
                        width: file.width || 800,
                        height: file.height || 600
                    });

                    // Force COCO categories to match our Global Final Class List
                    // The AnnotationConverter.internalToCoco creates its own category map based on "seen" labels.
                    // We need to override the ID mapping to match `finalClassNames`.

                    // Re-process annotations to fix category_id based on finalClassNames
                    coco.categories = finalClassNames.map((name, idx) => ({ id: idx, name })); // YOLO is 0-indexed typically for txt, but COCO obj uses 1-based usually.
                    // Wait, AnnotationConverter.cocoToYolo expects categories in COCO format.
                    // Let's rely on cocoToYolo's logic but we must ensure consistent IDs.

                    // Actually, `cocoToYolo` takes `classNames` as a parameter to enforce mapping!
                    // static yoloToCoco(..., classNames) -> converts txt to coco
                    // static cocoToYolo(cocoData) -> returns { txt, classes }

                    // The `cocoToYolo` method inside AnnotationConverter might not accept an external class map to enforce IDs.
                    // Let's look at `cocoToYolo` again.
                    // It does:
                    // const sortedCategories = [...(cocoData.categories || [])].sort((a, b) => a.id - b.id);
                    // catIdToYoloIdx.set(cat.id, idx);

                    // So it relies on the order inside `cocoData.categories`.
                    // We must rewrite `coco.categories` and `coco.annotations[].category_id` to match our global list.

                    const localCatMap = new Map(); // name -> local_coco_id
                    coco.categories.forEach(c => localCatMap.set(c.name, c.id));

                    // Update categories to match Global List order
                    coco.categories = finalClassNames.map((name, idx) => ({
                        id: idx + 1, // COCO IDs usually 1-based
                        name: name
                    }));

                    // Update annotations to point to new IDs
                    coco.annotations.forEach(ann => {
                        // Find label name using old ID
                        // Wait, internalToCoco result implies `category_id` maps to the names it found.
                        // Let's bypass internalToCoco's category generation and just map directly via label name.
                        // Internal annotation has 'label' property.
                        // We can generate YOLO lines directly from Internal Annotations + finalClassNames.
                        // This is safer than round-tripping through COCO if we want strict ID control.
                    });

                    // Direct Generation of YOLO lines from Internal Annotations
                    const lines = annotations.map(ann => {
                        const classIdx = finalClassNames.indexOf(ann.label);
                        if (classIdx === -1) return null; // Should not happen

                        // Normalize points
                        const width = file.width || 800;
                        const height = file.height || 600;

                        const normPoints = [];
                        for (let i = 0; i < ann.points.length; i += 2) {
                            let x = ann.points[i] / width;
                            let y = ann.points[i + 1] / height;

                            // Clamp
                            x = Math.max(0, Math.min(1, x));
                            y = Math.max(0, Math.min(1, y));

                            normPoints.push(x.toFixed(6));
                            normPoints.push(y.toFixed(6));
                        }

                        return `${classIdx} ${normPoints.join(' ')}`;
                    }).filter(l => l);

                    if (lines.length > 0) {
                        const txtFileName = file.name.replace(/\.[^.]+$/, '') + '.txt';
                        labelsFolder.file(txtFileName, lines.join('\n'));
                    }
                }
            } catch (err) {
                console.warn(`Skipping labels for ${file.name}`, err);
            }
        }
    }

    // 4. Create classes.txt (The map/reference for the user)
    // Line 0 = Class 0, Line 1 = Class 1
    zip.file("classes.txt", finalClassNames.join('\n'));

    // 5. Create data.yaml
    // User requested generic class names (class_0, class_1) to avoid format issues.
    // The user can edit this file manually to rename classes.
    const genericNames = finalClassNames.map((_, idx) => `class_${idx}`);

    // Using dictionary format for robustness
    const namesBlock = genericNames.map((n, i) => `  ${i}: ${n}`).join('\n');

    const yamlContent = `path: .
train: images
val: images
nc: ${finalClassNames.length}
names:
${namesBlock}

# ORIGINAL NAMES (Reference):
# ${finalClassNames.map((n, i) => `${i}: ${n}`).join('\n# ')}
`;
    zip.file("data.yaml", yamlContent);

    // 6. Generate and Save
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${projectName}_export.zip`);

    return { success: true, count: files.length };
}
