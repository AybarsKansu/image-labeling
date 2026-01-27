/**
 * useFileSystem Hook
 * 
 * Manages file system state using IndexedDB (Dexie) with:
 * - Web Worker integration for off-main-thread processing
 * - Blob URL management to prevent memory leaks
 * - Live query subscription for reactive updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db, { FileStatus } from '../db/index';
import { addFilesInChunks, getFile, updateFile, deleteFile, saveSetting, getSetting } from '../db/fileOperations';

export function useFileSystem() {
    // State
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState({ processed: 0, total: 0 });
    const [activeFileId, setActiveFileId] = useState(null);
    const [activeFileData, setActiveFileData] = useState(null);
    const [classNames, setClassNames] = useState([]);
    const [error, setError] = useState(null);

    // Refs for memory management
    const activeBlobUrlRef = useRef(null);
    const workerRef = useRef(null);

    // Live query for file list (only metadata, no blobs for performance)
    const files = useLiveQuery(
        () => db.files.orderBy('created_at').reverse().toArray(),
        [],
        []
    );

    // Initialize Web Worker
    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../workers/fileProcessor.worker.js', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.onmessage = handleWorkerMessage;

        // Load saved class names
        getSetting('classNames').then(saved => {
            if (saved) setClassNames(saved);
        });

        return () => {
            workerRef.current?.terminate();
            // Revoke any active blob URL
            if (activeBlobUrlRef.current) {
                URL.revokeObjectURL(activeBlobUrlRef.current);
            }
        };
    }, []);

    // Handle messages from Web Worker
    const handleWorkerMessage = useCallback((e) => {
        const { type, payload } = e.data;

        switch (type) {
            case 'PROCESS_PROGRESS':
                setProcessingProgress(payload);
                break;

            case 'PROCESS_COMPLETE':
                handleProcessComplete(payload);
                break;

            case 'PROCESS_ERROR':
                setError(payload.error);
                setIsProcessing(false);
                break;

            default:
                break;
        }
    }, []);

    // Handle completed file processing (Images + Labels pairing)
    const handleProcessComplete = useCallback(async (result) => {
        try {
            const { images, labels } = result;
            const totalToProcess = images.length + labels.length;
            let processedItems = 0;

            // 1. Process Images
            for (const img of images) {
                // Check if a record with this base name already exists (could be a placeholder from a previous label upload)
                const existing = await db.files.where('baseName').equals(img.baseName).first();

                if (existing) {
                    // Update existing record with image data
                    await db.files.update(existing.id, {
                        name: img.name,
                        path: img.path || '',
                        blob: img.blob,
                        thumbnail: img.thumbnail,
                        width: img.width,
                        height: img.height,
                        status: existing.label_data ? FileStatus.PENDING : FileStatus.MISSING_LABEL
                    });
                } else {
                    // Create new record
                    await db.files.add({
                        name: img.name,
                        baseName: img.baseName,
                        path: img.path || '',
                        type: 'image',
                        blob: img.blob,
                        thumbnail: img.thumbnail,
                        width: img.width,
                        height: img.height,
                        label_data: null,
                        status: FileStatus.MISSING_LABEL,
                        created_at: new Date().toISOString()
                    });
                }
                processedItems++;
                setProcessingProgress({ processed: processedItems, total: totalToProcess, phase: 'saving' });
            }

            // 2. Process Labels
            for (const label of labels) {
                const existing = await db.files.where('baseName').equals(label.baseName).first();

                if (existing) {
                    // Update existing record with label data
                    await db.files.update(existing.id, {
                        label_data: label.data,
                        path: existing.path || label.path || '', // Prefer image path
                        // If it was missing-label, it now has both.
                        status: existing.blob ? FileStatus.PENDING : FileStatus.MISSING_IMAGE
                    });
                } else {
                    // Create placeholder record
                    await db.files.add({
                        name: `(Missing Image) ${label.baseName}`,
                        baseName: label.baseName,
                        path: label.path || '',
                        type: 'image', // Still categorized as image record for UI consistency
                        blob: null,
                        thumbnail: null,
                        label_data: label.data,
                        status: FileStatus.MISSING_IMAGE,
                        created_at: new Date().toISOString()
                    });
                }
                processedItems++;
                setProcessingProgress({ processed: processedItems, total: totalToProcess, phase: 'saving' });
            }

            // Save class names
            if (result.classNames.length > 0) {
                setClassNames(result.classNames);
                await saveSetting('classNames', result.classNames);
            }

            setIsProcessing(false);
            setProcessingProgress({ processed: 0, total: 0 });

        } catch (err) {
            console.error('Process handling failed:', err);
            setError(err.message);
            setIsProcessing(false);
        }
    }, []);

    /**
     * Clear all files from the project (Local + Backend)
     */
    const clearProject = useCallback(async () => {
        try {
            setIsProcessing(true);

            // 1. Call Backend to clear session
            try {
                const axios = (await import('axios')).default;
                await axios.delete('/api/files/clear-session');
            } catch (err) {
                console.warn('Backend clear failed (session might already be empty):', err);
            }

            // 2. Revoke all blob URLs to prevent memory leaks
            const allFiles = await db.files.toArray();
            allFiles.forEach(f => {
                if (f.blobUrl) URL.revokeObjectURL(f.blobUrl);
            });

            // 3. Clear IndexedDB
            await db.files.clear();
            await db.labels.clear();

            // 4. Reset state
            setActiveFileId(null);
            setActiveFileData(null);
            setIsProcessing(false);

        } catch (err) {
            setError('Failed to clear project: ' + err.message);
            setIsProcessing(false);
        }
    }, []);

    /**
     * Helper: Read file as text
     */
    const readFileAsText = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        });
    };

    /**
     * Robust Ingestion Helper
     * 1. Separates images vs labels
     * 2. Sends images + single-file labels to Worker (efficient processing & pairing)
     * 3. Processes Batch labels (JSON/XML) in Main Thread
     */
    const ingestHelper = useCallback(async (fileList) => {
        if (!workerRef.current || !fileList || fileList.length === 0) return;

        setIsProcessing(true);
        setError(null);

        const filesArray = Array.from(fileList);
        const images = [];
        const singleLabels = [];
        const batchLabels = [];

        // Helper to extract path
        const getFilePath = (file) => {
            let p = file.webkitRelativePath || file.path || file.name;
            if (typeof p === 'string' && p.startsWith('/')) p = p.substring(1);
            return p;
        };

        // 1. Analyze and Sort Files
        for (const file of filesArray) {
            const filePath = getFilePath(file);

            // Check for image types
            if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(file.name)) {
                images.push({ file, _customPath: filePath });
                continue;
            }

            // Check for label types
            if (/\.(json|xml|txt)$/i.test(file.name)) {
                if (file.name.toLowerCase().endsWith('.txt')) {
                    singleLabels.push({ file, _customPath: filePath });
                } else {
                    try {
                        const text = await readFileAsText(file);
                        const AnnotationConverter = (await import('../utils/annotationConverter')).AnnotationConverter;
                        const format = AnnotationConverter.detectFormat(text);

                        if (['coco', 'toon-batch', 'voc-aggregated', 'yolo-aggregated'].includes(format)) {
                            batchLabels.push({ file, content: text, format, path: filePath });
                        } else {
                            singleLabels.push({ file, _customPath: filePath });
                        }
                    } catch (e) {
                        console.warn(`Failed to analyze ${file.name}, treating as single/ignored.`);
                        singleLabels.push({ file, _customPath: filePath });
                    }
                }
            }
        }

        const total = images.length + singleLabels.length + batchLabels.length;
        setProcessingProgress({ processed: 0, total, phase: 'analyzing' });

        // 2. Send Images & Single Labels to Worker
        if (images.length > 0 || singleLabels.length > 0) {
            workerRef.current.postMessage({
                type: 'PROCESS_FILES',
                payload: { files: [...images, ...singleLabels] }
            });
        }

        // 3. Process Batch Labels (Main Thread)
        if (batchLabels.length > 0) {
            const AnnotationConverter = (await import('../utils/annotationConverter')).AnnotationConverter;

            let processedCount = 0;
            for (const item of batchLabels) {
                try {
                    const projectImages = await db.files.toArray();
                    const result = AnnotationConverter.parseAnnotations(item.content, projectImages, item.format);

                    for (const [imageName, anns] of Object.entries(result.annotations)) {
                        const existing = await db.files.where('name').equals(imageName).first();

                        const toonData = AnnotationConverter.internalToToon(anns, {
                            name: imageName, width: 800, height: 600
                        });

                        if (existing) {
                            await db.files.update(existing.id, {
                                label_data: toonData,
                                status: existing.blob ? FileStatus.PENDING : FileStatus.MISSING_IMAGE
                            });
                        } else {
                            await db.files.add({
                                name: imageName,
                                baseName: imageName.replace(/\.[^/.]+$/, ""),
                                path: item.path || '', // Use the label file's path for grouping if needed
                                type: 'image',
                                blob: null,
                                thumbnail: null,
                                label_data: toonData,
                                status: FileStatus.MISSING_IMAGE,
                                created_at: new Date().toISOString()
                            });
                        }
                    }
                    processedCount++;
                } catch (err) {
                    console.error(`Batch process failed for ${item.file.name}:`, err);
                    setError(`Batch import failed: ${err.message}`);
                }
            }

            if (images.length === 0 && singleLabels.length === 0) {
                setIsProcessing(false);
                setProcessingProgress({ processed: 0, total: 0 });
            }
        }

    }, []);

    // Deprecate direct ingestFiles in favor of one that logs or redirects?
    // For now, let's keep ingestFiles as an alias or direct worker access if needed, 
    // but the UI will use ingestHelper.
    const ingestFiles = ingestHelper;

    /**
     * Select a file to display on canvas.
     * Loads the full blob/URL and manages memory.
     */
    const selectFile = useCallback(async (fileId) => {
        if (fileId === activeFileId) return;

        // Revoke previous blob URL to prevent memory leak
        if (activeBlobUrlRef.current) {
            URL.revokeObjectURL(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
        }

        setActiveFileId(fileId);

        if (!fileId) {
            setActiveFileData(null);
            return;
        }

        try {
            const file = await getFile(fileId);

            if (!file) {
                setActiveFileData(null);
                return;
            }

            // Determine image source
            let imageUrl;
            if (file.backend_url) {
                // File is synced, use backend URL
                imageUrl = file.backend_url;
            } else if (file.blob) {
                // File is local, create blob URL
                imageUrl = URL.createObjectURL(file.blob);
                activeBlobUrlRef.current = imageUrl;
            } else {
                // No image data available
                imageUrl = null;
            }

            setActiveFileData({
                ...file,
                imageUrl,
                annotations: file.label_data ? parseLabelData(file.label_data, classNames, file.width, file.height) : []
            });

        } catch (err) {
            console.error('Error selecting file:', err);
            setActiveFileData(null);
        }
    }, [activeFileId, classNames]);

    /**
     * Update annotations for the active file.
     */
    const updateActiveAnnotations = useCallback(async (annotations, format = 'yolo') => {
        if (!activeFileId) return;

        const labelData = serializeAnnotations(annotations, format, classNames, activeFileData?.width, activeFileData?.height);

        await updateFile(activeFileId, {
            label_data: labelData,
            status: FileStatus.PENDING // Mark as pending for re-sync
        });

    }, [activeFileId, classNames]);

    /**
     * Update annotations for any file by ID.
     */
    const updateFileAnnotations = useCallback(async (fileId, annotations) => {
        const file = await getFile(fileId);
        if (!file) return;

        // Convert annotations to TOON format for storage
        const AnnotationConverter = (await import('../utils/annotationConverter')).AnnotationConverter;
        const labelData = AnnotationConverter.internalToToon(annotations, {
            name: file.name,
            width: file.width || 800,
            height: file.height || 600
        });

        await updateFile(fileId, {
            label_data: labelData,
            status: FileStatus.PENDING
        });
    }, []);

    /**
     * Retry a failed sync
     */
    const retryFile = useCallback(async (fileId) => {
        await db.files.update(fileId, {
            status: FileStatus.PENDING,
            error: null
        });
    }, []);

    const removeFile = useCallback(async (fileId) => {
        const file = await db.files.get(fileId);
        if (!file) return;

        // 1. If synced, consider background delete (optional requirement based on user request)
        if (file.status === FileStatus.SYNCED && file.backend_url) {
            try {
                const axios = (await import('axios')).default;
                await axios.delete(`/api/files/delete/${fileId}`);
            } catch (err) {
                console.warn('Backend delete failed:', err);
            }
        }

        // 2. Local delete
        await deleteFile(fileId);

        if (fileId === activeFileId) {
            setActiveFileId(null);
            setActiveFileData(null);
        }
    }, [activeFileId]);

    const renameClassActiveOnly = useCallback(async (oldName, newName) => {
        if (!activeFileId || !activeFileData) return;
        if (oldName === newName) return;

        const updatedAnnotations = activeFileData.annotations.map(ann =>
            ann.label === oldName ? { ...ann, label: newName } : ann
        );

        // Update active file in DB
        await updateActiveAnnotations(updatedAnnotations);

        // Refresh local state
        setActiveFileData(prev => ({
            ...prev,
            annotations: updatedAnnotations
        }));
    }, [activeFileId, activeFileData, updateActiveAnnotations]);

    /**
     * Get sync statistics.
     */
    const syncStats = useLiveQuery(async () => {
        const pending = await db.files.where('status').equals(FileStatus.PENDING).count();
        const syncing = await db.files.where('status').equals(FileStatus.SYNCING).count();
        const synced = await db.files.where('status').equals(FileStatus.SYNCED).count();
        const total = await db.files.count();

        return { pending, syncing, synced, total };
    }, [], { pending: 0, syncing: 0, synced: 0, total: 0 });

    /**
     * Save Project to Backend (dataset/)
     */
    const saveProjectToBackend = useCallback(async (enableAugmentation = false) => {
        setIsProcessing(true);
        setProcessingProgress({ processed: 0, total: 0, phase: 'saving' });
        try {
            const files = await db.files.toArray();
            let count = 0;
            const total = files.length;
            const axios = (await import('axios')).default;

            for (const file of files) {
                if (!file.blob || !(file.blob instanceof Blob)) continue;

                const formData = new FormData();
                formData.append('file', file.blob, file.name);
                formData.append('image_name', file.name);
                formData.append('augmentation', enableAugmentation ? 'true' : 'false');

                let anns = [];
                if (file.label_data) {
                    const AnnotationConverter = (await import('../utils/annotationConverter')).AnnotationConverter;
                    // Use helper we know exists in scope from module logic
                    const internal = parseLabelData(file.label_data, classNames, file.width, file.height);
                    if (internal) {
                        anns = internal.map(a => ({
                            label: a.label,
                            points: a.points
                        }));
                    }
                }
                formData.append('annotations', JSON.stringify(anns));

                await axios.post('/api/save', formData);
                count++;
                setProcessingProgress({ processed: count, total, phase: 'saving' });
            }
            setIsProcessing(false);
            return { success: true, count };
        } catch (err) {
            console.error(err);
            setIsProcessing(false);
            return { success: false, error: err.message };
        }
    }, [classNames]);

    return {
        // State
        files,
        activeFileId,
        activeFileData,
        classNames,
        isProcessing,
        processingProgress,
        syncStats,
        error,

        // Actions
        saveProjectToBackend,
        ingestFiles,
        clearProject,
        retryFile,
        renameClass,
        renameClassActiveOnly,
        selectFile,
        updateActiveAnnotations,
        updateFileAnnotations,
        removeFile,
        setClassNames
    };
}

/**
 * Global class rename logic.
 * Finds all files with label_data and updates the class name.
 */
async function renameClass(oldName, newName, classNames, setClassNames) {
    if (oldName === newName) return;

    // 1. Update classNames array
    const newClassNames = classNames.map(c => c === oldName ? newName : c);
    setClassNames(newClassNames);
    await saveSetting('classNames', newClassNames);

    // 2. Find records in Dexie that might contain this class
    // We update ALL records that have label_data because we want to ensure consistency
    const records = await db.files.where('label_data').notEqual(null).toArray();

    const oldIdx = classNames.indexOf(oldName);
    if (oldIdx === -1) return; // Should not happen if UI is consistent

    // 3. Batch update records
    const updates = records.map(record => {
        // Serialized YOLO format is: class_id x y w h
        // Changing the name doesn't change the ID in YOLO logic usually, 
        // BUT if we are renaming, we just update the metadata at the bottom: # classes: dog, cat
        const lines = record.label_data.split('\n');
        const updatedLines = lines.map(line => {
            if (line.startsWith('# classes:')) {
                return `# classes: ${newClassNames.join(', ')}`;
            }
            return line;
        });

        return {
            id: record.id,
            label_data: updatedLines.join('\n'),
            status: FileStatus.PENDING // Mark for re-sync since metadata changed
        };
    });

    await db.files.bulkPut(updates.map(u => ({
        ...(records.find(r => r.id === u.id)),
        ...u
    })));
}

// Helper: Parse label data (YOLO format) to annotations array
function parseLabelData(labelData, classNames, imgWidth = 0, imgHeight = 0) {
    if (!labelData) return [];

    // Ensure string
    const dataStr = typeof labelData === 'string' ? labelData : JSON.stringify(labelData);

    const lines = dataStr.trim().split('\n').filter(l => !l.startsWith('#') && l.trim());

    return lines.map((line, idx) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;

        const classId = parseInt(parts[0]);
        const className = classNames[classId] || `Class ${classId}`;

        // YOLO format: class_id x_center y_center width height [...polygon points]
        if (parts.length === 5) {
            // Bounding box
            const xc = parseFloat(parts[1]);
            const yc = parseFloat(parts[2]);
            const w = parseFloat(parts[3]);
            const h = parseFloat(parts[4]);

            // Denormalize if we have dimensions
            const absW = imgWidth ? w * imgWidth : w;
            const absH = imgHeight ? h * imgHeight : h;
            const absX = imgWidth ? (xc * imgWidth) - (absW / 2) : xc;
            const absY = imgHeight ? (yc * imgHeight) - (absH / 2) : yc;

            // Note: internal state expects TOP-LEFT (x,y) and w,h for boxes
            // but some project tools might use center. 
            // Based on CanvasStage, it uses {x, y, width, height} for Rect.

            return {
                id: `ann_${idx}`,
                type: 'box',
                label: className,
                classId,
                x: absX,
                y: absY,
                w: absW,
                h: absH,
                points: [absX, absY, absX + absW, absY, absX + absW, absY + absH, absX, absY + absH] // Also add points for generic tools
            };
        } else {
            // Polygon (segmentation)
            const points = [];
            for (let i = 1; i < parts.length; i += 2) {
                const px = parseFloat(parts[i]);
                const py = parseFloat(parts[i + 1]);
                points.push(imgWidth ? px * imgWidth : px);
                points.push(imgHeight ? py * imgHeight : py);
            }
            return {
                id: `ann_${idx}`,
                type: 'poly',
                label: className,
                classId,
                points // Denormalized
            };
        }
    }).filter(Boolean);
}

// Helper: Serialize annotations to label format
function serializeAnnotations(annotations, format, classNames, imgWidth = 0, imgHeight = 0) {
    if (format !== 'yolo') {
        console.warn('Only YOLO format is currently supported for serialization');
    }

    const lines = annotations.map(ann => {
        let classId = ann.classId;
        if (classId === undefined) {
            classId = classNames.indexOf(ann.label);
            if (classId === -1) classId = 0;
        }

        if (ann.type === 'box') {
            const x = imgWidth ? (ann.x + ann.w / 2) / imgWidth : ann.x;
            const y = imgHeight ? (ann.y + ann.h / 2) / imgHeight : ann.y;
            const w = imgWidth ? ann.w / imgWidth : ann.w;
            const h = imgHeight ? ann.h / imgHeight : ann.h;
            return `${classId} ${x} ${y} ${w} ${h}`;
        } else if (ann.type === 'poly' && ann.points) {
            const normalizedPoints = [];
            for (let i = 0; i < ann.points.length; i += 2) {
                normalizedPoints.push(imgWidth ? ann.points[i] / imgWidth : ann.points[i]);
                normalizedPoints.push(imgHeight ? ann.points[i + 1] / imgHeight : ann.points[i + 1]);
            }
            return `${classId} ${normalizedPoints.join(' ')}`;
        }
        return null;
    }).filter(Boolean);

    // Add class metadata
    lines.push(`# classes: ${classNames.join(', ')}`);

    return lines.join('\n');
}

export default useFileSystem;
