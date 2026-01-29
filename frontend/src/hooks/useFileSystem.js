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

// Basic UUID regex check
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useFileSystem(projectId = null) {
    // State
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState({ processed: 0, total: 0 });
    const [activeFileId, setActiveFileId] = useState(null); // File loaded on canvas
    const [selectedFileIds, setSelectedFileIds] = useState(new Set()); // Multi-selection
    const [lastSelectedId, setLastSelectedId] = useState(null); // For Shift+Click range
    const [activeFileData, setActiveFileData] = useState(null);
    const [classNames, setClassNames] = useState([]);
    const [error, setError] = useState(null);

    // Refs for memory management
    const activeBlobUrlRef = useRef(null);
    const workerRef = useRef(null);

    // Validate project ID format
    const isValidProject = projectId && typeof projectId === 'string' && UUID_REGEX.test(projectId);

    // Live query for file list (only metadata, no blobs for performance)
    const files = useLiveQuery(
        async () => {
            if (!isValidProject) {
                // Return all files sorted by creation date
                return await db.files.orderBy('created_at').reverse().toArray();
            }

            try {
                // Get all files for this project
                const projectFiles = await db.files
                    .where('project_id')
                    .equals(projectId)
                    .toArray();

                // Sort in memory for maximum reliability
                return projectFiles.sort((a, b) => {
                    const dateA = new Date(a.created_at || 0);
                    const dateB = new Date(b.created_at || 0);
                    return dateB - dateA;
                });
            } catch (err) {
                console.error("Failed to query files:", err);
                return [];
            }
        },
        [projectId, isValidProject],
        []
    );

    // Handle completed file processing (Images + Labels pairing)
    const handleProcessComplete = useCallback(async (result) => {
        try {
            const { images, labels } = result;
            const totalToProcess = images.length + labels.length;
            let processedItems = 0;

            // Determine Target Project ID
            const targetPid = (isValidProject) ? projectId : (await db.projects.orderBy('created_at').first())?.id;

            if (!targetPid) {
                throw new Error("No active project found to save files to.");
            }

            // ---------------------------------------------------------
            // ADIM 1: Görüntüleri İşle
            // ---------------------------------------------------------
            const incomingImageBaseNames = images.map(img => img.baseName);
            const existingRecordsArray = await db.files
                .where('baseName')
                .anyOf(incomingImageBaseNames)
                .toArray();

            const existingInProject = existingRecordsArray.filter(f => f.project_id === targetPid);
            const existingMap = new Map(existingInProject.map(rec => [rec.baseName, rec]));

            const imageUpdates = images.map(img => {
                const existing = existingMap.get(img.baseName);
                if (existing) {
                    return {
                        ...existing,
                        name: img.name,
                        path: img.path || '',
                        blob: img.blob,
                        thumbnail: img.thumbnail,
                        width: img.width,
                        height: img.height,
                        status: existing.label_data ? FileStatus.PENDING : FileStatus.MISSING_LABEL,
                        project_id: targetPid
                    };
                } else {
                    return {
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
                        created_at: new Date().toISOString(),
                        project_id: targetPid
                    };
                }
            });

            if (imageUpdates.length > 0) {
                await db.files.bulkPut(imageUpdates);
                processedItems += images.length;
                setProcessingProgress({ processed: processedItems, total: totalToProcess, phase: 'saving' });

                const currentProject = await db.projects.get(targetPid);
                if (currentProject) {
                    const changes = {
                        updated_at: new Date().toISOString(),
                        file_count: (currentProject.file_count || 0) + images.length
                    };
                    if (!currentProject.thumbnail && imageUpdates[0].thumbnail) {
                        changes.thumbnail = imageUpdates[0].thumbnail;
                    }
                    await db.projects.update(targetPid, changes);
                }
            }

            // ---------------------------------------------------------
            // ADIM 2: Etiketleri İşle
            // ---------------------------------------------------------
            const incomingLabelBaseNames = labels.map(l => l.baseName);
            const freshRecordsArray = await db.files
                .where('baseName')
                .anyOf(incomingLabelBaseNames)
                .toArray();

            const freshInProject = freshRecordsArray.filter(f => f.project_id === targetPid);
            const freshMap = new Map(freshInProject.map(rec => [rec.baseName, rec]));

            const labelUpdates = [];
            for (const label of labels) {
                const existing = freshMap.get(label.baseName);
                if (existing) {
                    labelUpdates.push({
                        ...existing,
                        label_data: label.data,
                        path: existing.path || label.path || '',
                        status: existing.blob ? FileStatus.PENDING : FileStatus.MISSING_IMAGE,
                        project_id: targetPid
                    });
                } else {
                    labelUpdates.push({
                        name: `(Missing Image) ${label.baseName}`,
                        baseName: label.baseName,
                        path: label.path || '',
                        type: 'image',
                        blob: null,
                        thumbnail: null,
                        label_data: label.data,
                        width: 0,
                        height: 0,
                        status: FileStatus.MISSING_IMAGE,
                        created_at: new Date().toISOString(),
                        project_id: targetPid
                    });
                }
            }

            if (labelUpdates.length > 0) {
                await db.files.bulkPut(labelUpdates);
                processedItems += labels.length;
                setProcessingProgress({ processed: processedItems, total: totalToProcess, phase: 'saving' });
            }

            setIsProcessing(false);
            setProcessingProgress({ processed: 0, total: 0 });

        } catch (err) {
            console.error('Process handling failed:', err);
            setError(err.message);
            setIsProcessing(false);
        }
    }, [projectId, isValidProject, classNames]);

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
    }, [projectId, handleProcessComplete]); // Depend on projectId for process complete handler context

    // Initialize Web Worker
    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../workers/fileProcessor.worker.js', import.meta.url),
            { type: 'module' }
        );

        getSetting('classNames').then(saved => {
            if (saved) setClassNames(saved);
        });

        return () => {
            workerRef.current?.terminate();
            if (activeBlobUrlRef.current) URL.revokeObjectURL(activeBlobUrlRef.current);
        };
    }, []);

    // Keep worker.onmessage updated with latest closure
    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.onmessage = handleWorkerMessage;
        }
    }, [handleWorkerMessage]);

    /**
     * Clear all files from the project (Local + Backend)
     */
    const clearProject = useCallback(async () => {
        try {
            if (!isValidProject) return;
            setIsProcessing(true);

            // 1. Revoke blob URLs for project files
            const projectFiles = await db.files.where('project_id').equals(projectId).toArray();
            projectFiles.forEach(f => {
                if (f.blobUrl) URL.revokeObjectURL(f.blobUrl);
            });

            // 2. Clear IndexedDB for this project
            await db.files.where('project_id').equals(projectId).delete();

            // 3. Update project count
            await db.projects.update(projectId, { file_count: 0, thumbnail: null });

            // 4. Reset state
            setActiveFileId(null);
            setActiveFileData(null);
            setIsProcessing(false);

        } catch (err) {
            setError('Failed to clear project: ' + err.message);
            setIsProcessing(false);
        }
    }, [projectId, isValidProject]);

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
            // Prioritize webkitRelativePath for folder uploads
            let p = file.webkitRelativePath || file.path || file.name;
            if (typeof p === 'string' && p.startsWith('/')) p = p.substring(1);
            return p;
        };

        // 1. Analyze and Sort Files
        for (const file of filesArray) {
            const filePath = getFilePath(file);

            // Check for video types
            if (file.type.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.name)) {
                console.log(`[FileSystem] Video detected: ${file.name}`);
                // Videos are large, store directly to DB without worker processing for now
                // Ideally we might want a thumbnail generator here later
                const videoData = {
                    name: file.name,
                    baseName: file.name,
                    path: filePath,
                    type: 'video',
                    blob: file,
                    thumbnail: null, // TODO: Generate video thumbnail?
                    width: 0, // Will be known when loaded
                    height: 0,
                    label_data: null,
                    status: FileStatus.SYNCED, // Videos are local-only for now or considered synced
                    created_at: new Date().toISOString(),
                    project_id: (isValidProject) ? projectId : (await db.projects.orderBy('created_at').first())?.id
                };

                await db.files.add(videoData);
                continue;
            }

            // Check for image types
            if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(file.name)) {
                images.push({ file, _customPath: filePath });
                continue;
            }

            // Check for label types
            if (/\.(json|xml|txt)$/i.test(file.name)) {
                try {
                    const text = await readFileAsText(file);
                    const AnnotationConverter = (await import('../utils/annotationConverter')).AnnotationConverter;
                    const format = AnnotationConverter.detectFormat(text);

                    // List of formats that contain MULTIPLE images (Batch)
                    const batchFormats = ['coco', 'toon-batch', 'voc-aggregated', 'yolo-aggregated'];

                    if (batchFormats.includes(format)) {
                        console.log(`[FileSystem] Batch Label detected: ${file.name} (${format})`);
                        batchLabels.push({ file, content: text, format, path: filePath });
                    } else {
                        // It's a single-image label (Single YOLO, Single VOC, Single TOON, or Single-image COCO)
                        console.log(`[FileSystem] Single Label detected: ${file.name} (${format})`);
                        singleLabels.push({ file, _customPath: filePath, content: text, format });
                    }
                } catch (e) {
                    console.warn(`Failed to analyze ${file.name}, defaulting to single label queue.`);
                    singleLabels.push({ file, _customPath: filePath });
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

                    const annotationsToProcess = Object.entries(result.annotations);
                    console.log(`[FileSystem] Processing ${annotationsToProcess.length} matched files...`);

                    for (const [imageName, anns] of annotationsToProcess) {
                        // REFINED LOOKUP
                        let existing = await db.files.where('path').equals(imageName).first();
                        if (!existing) {
                            existing = await db.files.where('name').equals(imageName).first();
                        }

                        const toonData = AnnotationConverter.internalToToon(anns, {
                            name: imageName, width: existing?.width || 800, height: existing?.height || 600
                        });

                        if (existing) {
                            console.log(`[FileSystem] Updating existing image: ${imageName} (ID: ${existing.id})`);
                            await db.files.update(existing.id, {
                                label_data: toonData,
                                status: existing.blob ? FileStatus.PENDING : FileStatus.MISSING_IMAGE
                            });
                        } else {
                            console.warn(`[FileSystem] Creating NEW placeholder for "${imageName}" -> MISSING IMAGE`);
                            await db.files.add({
                                name: imageName.split('/').pop(),
                                baseName: imageName.replace(/\.[^/.]+$/, "").split('/').pop(),
                                path: imageName,
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

            // Force refresh of active file if it was updated during batch process
            if (activeFileId) {
                const activeUpdated = batchLabels.some(item => {
                    // This is a bit complex as we don't know exactly which images were in which batch
                    // but we can just trigger a refresh to be safe if any batch was processed
                    return true;
                });

                if (activeUpdated) {
                    console.log('[FileSystem] Batch process complete, refreshing active file UI...');
                    const currentId = activeFileId;
                    setActiveFileId(null);
                    setTimeout(() => setActiveFileId(currentId), 50);
                }
            }

            if (images.length === 0 && singleLabels.length === 0) {
                setIsProcessing(false);
                setProcessingProgress({ processed: 0, total: 0 });
            }
        }

    }, [projectId, isValidProject, activeFileId]);

    // Deprecate direct ingestFiles in favor of one that logs or redirects?
    // For now, let's keep ingestFiles as an alias or direct worker access if needed, 
    // but the UI will use ingestHelper.
    const ingestFiles = ingestHelper;

    /**
     * Select a file to display on canvas.
     * Loads the full blob/URL and manages memory.
     */
    // Race condition guard
    const loadingFileIdRef = useRef(null);

    /**
     * Keep activeFileData in sync with DB updates (e.g. from Worker or ingestion)
     */
    useEffect(() => {
        if (!activeFileId || !files || files.length === 0 || !activeFileData) return;

        const currentInDb = files.find(f => f.id === activeFileId);
        if (currentInDb) {
            // Check if label data has changed in the database since we loaded it
            // Using a simple check to see if we should refresh labels
            const dbHasLabels = !!currentInDb.label_data;
            const stateHasLabels = !!activeFileData.label_data;

            // If labels arrived in DB but we don't have them in state, SYNC!
            if (dbHasLabels && !stateHasLabels) {
                console.log(`[FileSystem] Ingestion finished for active file ${currentInDb.name}, updating UI...`);
                setActiveFileData(prev => ({
                    ...prev,
                    label_data: currentInDb.label_data,
                    annotations: parseLabelData(currentInDb.label_data, classNames, currentInDb.width, currentInDb.height)
                }));
            }
        }
    }, [files, activeFileId, classNames, activeFileData]);

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

        // 1. Set Loading State & Barrier
        loadingFileIdRef.current = fileId;
        setActiveFileId(fileId);

        if (!fileId) {
            setActiveFileData(null);
            return;
        }

        // 2. Clear old data immediately to prevent ghosting
        setActiveFileData(null);

        try {
            const file = await getFile(fileId);

            // 3. BARRIER CHECK: If user clicked another file while we were waiting, ABORT.
            if (loadingFileIdRef.current !== fileId) {
                console.warn(`[RaceCondition] Ignored stale load for ${fileId}, current is ${loadingFileIdRef.current}`);
                return;
            }

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
            // Only clear if we are still the active requester
            if (loadingFileIdRef.current === fileId) {
                setActiveFileData(null);
            }
        }
    }, [activeFileId, classNames]);

    /**
     * Update annotations for the active file.
     */
    const updateActiveAnnotations = useCallback(async (annotations, options = {}) => {
        // Use provided targetFileId (robust for fast switching) or fallback to current state
        const fileId = options.targetFileId || activeFileId;
        if (!fileId) return;

        const { width, height, format = 'yolo' } = options;
        const w = width || activeFileData?.width || 0;
        const h = height || activeFileData?.height || 0;

        const labelData = serializeAnnotations(annotations, format, classNames, w, h);

        await updateFile(fileId, {
            label_data: labelData,
            width: w || undefined,
            height: h || undefined,
            status: FileStatus.PENDING
        });

    }, [activeFileId, classNames, activeFileData]);

    const updateFileAnnotations = useCallback(async (fileId, annotations, options = {}) => {
        const file = await getFile(fileId);
        if (!file) return;

        const { width, height } = options;
        const w = width || file.width || 0;
        const h = height || file.height || 0;

        const AnnotationConverter = (await import('../utils/annotationConverter')).AnnotationConverter;
        const labelData = AnnotationConverter.internalToToon(annotations, {
            name: file.name,
            width: w,
            height: h
        });

        await updateFile(fileId, {
            label_data: labelData,
            width: w || undefined,
            height: h || undefined,
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

        // Local delete only
        await deleteFile(fileId);

        if (fileId === activeFileId) {
            setActiveFileId(null);
            setActiveFileData(null);
        }
        // Also remove from selection
        setSelectedFileIds(prev => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
        });
    }, [activeFileId]);

    /**
     * Clear all labels but keep images
     */
    const clearAllLabels = useCallback(async () => {
        try {
            setIsProcessing(true);
            const allFiles = await db.files.toArray();

            const updates = allFiles.map(file => ({
                id: file.id,
                label_data: null,
                status: file.blob ? FileStatus.MISSING_LABEL : FileStatus.MISSING_IMAGE
            }));

            await db.files.bulkPut(updates.map(u => ({
                ...(allFiles.find(f => f.id === u.id)),
                ...u
            })));

            // Refresh active file UI
            if (activeFileId) {
                const currentId = activeFileId;
                setActiveFileId(null);
                setTimeout(() => setActiveFileId(currentId), 50);
            }

            setIsProcessing(false);
        } catch (err) {
            console.error('Failed to clear labels:', err);
            setError(err.message);
            setIsProcessing(false);
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
    const saveProjectToBackend = useCallback(async (augParams = null) => {
        setIsProcessing(true);
        setProcessingProgress({ processed: 0, total: 0, phase: 'saving' });
        try {
            // ONLY get files belonging to THIS project
            const projectFiles = await db.files.where('project_id').equals(projectId).toArray();
            console.log("Project files" + projectFiles);
            console.log(`[SaveDebug] Found ${projectFiles.length} files to save for project ${projectId}`);

            let count = 0;
            const total = projectFiles.length;
            const axios = (await import('axios')).default;

            for (const file of projectFiles) {
                console.log(`[SaveDebug] Processing file: ${file.name}`);
                if (!file.blob || !(file.blob instanceof Blob)) continue;

                const formData = new FormData();
                formData.append('file', file.blob, file.name);
                formData.append('image_name', file.name);

                if (augParams) {
                    formData.append('aug_params', JSON.stringify(augParams));
                }

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

                // Use new Project-based Sync API
                if (!projectId) throw new Error("No project ID available for sync");
                await axios.post(`/api/projects/${projectId}/sync`, formData);
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
    }, [classNames, projectId]);

    /**
     * Pull project files/labels from backend storage into local IndexedDB
     */
    const syncWithBackend = useCallback(async () => {
        if (!isValidProject) return { success: false, error: 'Invalid project' };

        setIsProcessing(true);
        setProcessingProgress({ processed: 0, total: 0, phase: 'syncing' });

        try {
            const axios = (await import('axios')).default;
            const response = await axios.get(`/api/projects/${projectId}/files`);
            const remoteFilenames = response.data.files || [];

            if (remoteFilenames.length === 0) {
                setIsProcessing(false);
                return { success: true, count: 0 };
            }

            setProcessingProgress({ processed: 0, total: remoteFilenames.length, phase: 'syncing' });

            // 1. Get existing files for this project to avoid duplicates
            const localFiles = await db.files.where('project_id').equals(projectId).toArray();
            const localMap = new Map(localFiles.map(f => [f.name, f]));

            const newFiles = [];
            let count = 0;

            for (const filename of remoteFilenames) {
                if (localMap.has(filename)) {
                    count++;
                    continue;
                }

                // Create a record with backend_url
                // Since we don't have the blob, we mark status as SYNCED (it's on backend)
                // but we might want a way to lazy-load it.
                // For now, we point backend_url to our new static mount.
                const backendUrl = `/static/projects/${projectId}/raw_data/images/${filename}`;

                const fileData = {
                    name: filename,
                    baseName: filename.replace(/\.[^/.]+$/, ""),
                    path: filename,
                    type: 'image',
                    blob: null,
                    thumbnail: null, // We'll lack thumbnails until loaded
                    backend_url: backendUrl,
                    status: FileStatus.SYNCED,
                    created_at: new Date().toISOString(),
                    project_id: projectId
                };

                newFiles.push(fileData);
                count++;
                if (newFiles.length % 10 === 0) {
                    setProcessingProgress({ processed: count, total: remoteFilenames.length, phase: 'syncing' });
                }
            }

            if (newFiles.length > 0) {
                await db.files.bulkAdd(newFiles);

                // Update project count to match reality
                const totalCount = await db.files.where('project_id').equals(projectId).count();
                await db.projects.update(projectId, { file_count: totalCount });
            }

            setIsProcessing(false);
            return { success: true, count: newFiles.length };

        } catch (err) {
            console.error('Sync from backend failed:', err);
            setIsProcessing(false);
            setError(err.message);
            return { success: false, error: err.message };
        }
    }, [projectId, isValidProject]);

    // Multi-selection handlers
    const handleFileClick = useCallback((fileId, event) => {
        const isCtrl = event?.ctrlKey || event?.metaKey;
        const isShift = event?.shiftKey;

        if (isShift && lastSelectedId && files.length > 0) {
            // Range selection
            const fileIds = files.map(f => f.id);
            const startIdx = fileIds.indexOf(lastSelectedId);
            const endIdx = fileIds.indexOf(fileId);

            if (startIdx !== -1 && endIdx !== -1) {
                const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                const rangeIds = fileIds.slice(from, to + 1);
                setSelectedFileIds(new Set(rangeIds));
            }
        } else if (isCtrl) {
            // Toggle selection
            setSelectedFileIds(prev => {
                const next = new Set(prev);
                if (next.has(fileId)) {
                    next.delete(fileId);
                } else {
                    next.add(fileId);
                }
                return next;
            });
            setLastSelectedId(fileId);
        } else {
            // Single selection
            setSelectedFileIds(new Set([fileId]));
            setLastSelectedId(fileId);
        }

        // Load clicked file on canvas
        selectFile(fileId);
    }, [lastSelectedId, files, selectFile]);

    const clearSelection = useCallback(() => {
        setSelectedFileIds(new Set());
        setLastSelectedId(null);
    }, []);

    const selectAllFiles = useCallback(() => {
        if (files.length > 0) {
            setSelectedFileIds(new Set(files.map(f => f.id)));
        }
    }, [files]);

    const removeSelectedFiles = useCallback(async () => {
        if (selectedFileIds.size === 0) return;

        const idsToDelete = Array.from(selectedFileIds);
        for (const id of idsToDelete) {
            await removeFile(id);
        }
        setSelectedFileIds(new Set());
        setLastSelectedId(null);
    }, [selectedFileIds, removeFile]);

    return {
        // State
        files,
        activeFileId,
        selectedFileIds,
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
        clearAllLabels,
        retryFile,
        renameClass,
        renameClassActiveOnly,
        selectFile,
        handleFileClick,
        clearSelection,
        selectAllFiles,
        removeSelectedFiles,
        updateActiveAnnotations,
        updateFileAnnotations,
        removeFile,
        setClassNames,
        syncWithBackend
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

// Helper: Parse label data to annotations array (Handles TOON objects and YOLO strings)
function parseLabelData(labelData, classNames, imgWidth = 0, imgHeight = 0) {
    if (!labelData) return [];

    // CASE 1: TOON Format (Internal storage object)
    if (typeof labelData === 'object' && labelData !== null && labelData.v === '1.0') {
        const categories = labelData.c || [];
        const data = labelData.d || [];

        return data.map((item, idx) => {
            const [catIdx, rawPoints] = item;
            const label = categories[catIdx] || classNames[catIdx] || `class_${catIdx}`;

            // TOON points are absolute. If we have new dimensions, we might need to re-scale 
            // but for now we assume they are absolute or normalized properly based on previous save.
            let points = [...rawPoints];

            // Heuristic: If points are 0..1 and we have dimensions, denormalize them
            const isNormalized = points.length > 0 && points.every(p => p <= 1.05); // Allow slight overflow
            if (isNormalized && imgWidth && imgHeight) {
                points = points.map((p, i) => i % 2 === 0 ? p * imgWidth : p * imgHeight);
            }

            return {
                id: `ann_${idx}`,
                type: 'poly',
                label,
                points,
                originalRawPoints: points
            };
        });
    }

    // CASE 2: YOLO Format (Raw string fallback)
    const dataStr = typeof labelData === 'string' ? labelData : JSON.stringify(labelData);

    // Check if it's actually TOON hidden in a string
    if (dataStr.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(dataStr);
            if (parsed.v === '1.0') return parseLabelData(parsed, classNames, imgWidth, imgHeight);
        } catch (e) { }
    }

    // Standard YOLO string parsing
    let localClassNames = [];
    const embeddedMatch = dataStr.match(/^#\s*classes?:\s*(.+)$/im);
    if (embeddedMatch) {
        localClassNames = embeddedMatch[1].split(',').map(c => c.trim()).filter(c => c);
    }

    const lines = dataStr.trim().split('\n').filter(l => !l.startsWith('#') && l.trim());

    return lines.map((line, idx) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;

        const classId = parseInt(parts[0]);
        const className = localClassNames[classId] || `class_${classId}`;

        if (parts.length === 5) {
            // YOLO Bbox
            const xc = parseFloat(parts[1]);
            const yc = parseFloat(parts[2]);
            const w = parseFloat(parts[3]);
            const h = parseFloat(parts[4]);

            const absW = imgWidth ? w * imgWidth : w * 800;
            const absH = imgHeight ? h * imgHeight : h * 600;
            const absX = imgWidth ? (xc * imgWidth) - (absW / 2) : (xc * 800) - (absW / 2);
            const absY = imgHeight ? (yc * imgHeight) - (absH / 2) : (yc * 600) - (absH / 2);

            return {
                id: `ann_${idx}`,
                type: 'box',
                label: className,
                x: absX, y: absY, w: absW, h: absH,
                points: [absX, absY, absX + absW, absY, absX + absW, absY + absH, absX, absY + absH]
            };
        } else {
            // YOLO Polygon
            const points = [];
            for (let i = 1; i < parts.length; i += 2) {
                const px = parseFloat(parts[i]);
                const py = parseFloat(parts[i + 1]);
                points.push(imgWidth ? px * imgWidth : px * 800);
                points.push(imgHeight ? py * imgHeight : py * 600);
            }
            return {
                id: `ann_${idx}`,
                type: 'poly',
                label: className,
                points
            };
        }
    }).filter(Boolean);
}

// Helper: Serialize annotations to label format
function serializeAnnotations(annotations, format, classNames, imgWidth = 0, imgHeight = 0) {
    if (format !== 'yolo') {
        console.warn('Only YOLO format is currently supported for serialization');
    }

    // Fix: Construct a superset of classes (Global + Current File's Locals)
    // This ensures that if a user adds a new label "foo" that isn't in global classNames yet,
    // it gets added to this file's metadata and receives a valid ID, instead of defaulting to 0.
    const usedLabels = new Set(annotations.map(a => a.label).filter(l => l));
    const effectiveClassNames = [...(classNames || [])];

    usedLabels.forEach(label => {
        if (!effectiveClassNames.includes(label)) {
            effectiveClassNames.push(label);
        }
    });

    const lines = annotations.map(ann => {
        // ALWAYS derive classId from the label to ensure it matches the text shown in UI.
        // Relying on ann.classId can be dangerous if the label text was edited but ID wasn't.
        let classId = effectiveClassNames.indexOf(ann.label);

        // Fallback for completely unknown/empty labels (should default to 0 to keep file valid)
        if (classId === -1) classId = 0;

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

    // Add class metadata so we can reconstruct names when loading
    lines.push(`# classes: ${effectiveClassNames.join(', ')}`);

    return lines.join('\n');
}

export default useFileSystem;
