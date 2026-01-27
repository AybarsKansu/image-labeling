import { useCallback } from 'react';

/**
 * useProjectIO Hook
 * Manages Import/Export logic including the Unified Project Snapshot
 */
export const useProjectIO = (annotationsHook, fileSystem) => {
    const { annotations, setAnnotations } = annotationsHook;
    const { files, activeFileId, ingestFiles, selectFile } = fileSystem;

    // --- Export Project Snapshot ---
    // Output: { meta: {...}, data: [{ fileName, labels, status }] }
    const exportProjectSnapshot = useCallback(() => {
        const timestamp = new Date().toISOString();

        // Build the data array from files
        // We need to map file data + their annotations (which might be in memory if active, or in file object)

        // Note: 'files' contains the file list. The actual annotations are often stored in 'file.label_data'.
        // However, the *active* file's annotations are in 'annotationsHook.annotations'.
        // We need to make sure we get the latest state.

        const snapshotData = files.map(file => {
            let fileAnns = file.label_data || [];
            if (file.id === activeFileId) {
                fileAnns = annotations; // Use current editor state
            }

            // Clean up annotations for export (remove internal IDs if you want, or keep them)
            // Keeping them is fine for snapshot restoration.

            return {
                fileName: file.name,
                labels: fileAnns,
                status: file.status || 'pending'
            };
        });

        const snapshot = {
            meta: {
                type: 'project-snapshot',
                version: 1,
                exportedAt: timestamp
            },
            data: snapshotData
        };

        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `project_snapshot_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [files, activeFileId, annotations]);

    // --- Parse Project Snapshot (Import) ---
    const importProjectSnapshot = useCallback(async (jsonContent) => {
        try {
            const parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;

            if (parsed?.meta?.type !== 'project-snapshot') {
                return { success: false, reason: 'invalid_type' };
            }

            const incomingData = parsed.data || [];
            let updatedCount = 0;
            let skippedCount = 0;

            // We need to update the fileSystem files state. 
            // Since we can't easily iterate and set state inside useFileSystem from here without a unified setter,
            // we will need to access the Dexie DB or use a fileSystem method if available.
            // Assuming fileSystem has a method to batch update labels or we iterate.

            // Strategy: updating "files" state directly in the parent would be best, 
            // but here we can try to update via `fileSystem.updateFileLabelData` if it exists,
            // or we pass a callback.

            // Actually, we must rely on fileSystem to expose a way to update annotations for a file.
            // Let's assume we can update the DB or state.

            // Check if file system has 'updateFileLabels'. 
            // If not, we might need to modify useFileSystem.js.
            // For now, let's see what we can do.

            // We can match by name.
            const fileMap = new Map(files.map(f => [f.name, f.id]));

            for (const item of incomingData) {
                const targetId = fileMap.get(item.fileName);
                if (targetId) {
                    // Update this file
                    // We need a method to update the labels invisibly
                    if (fileSystem.updateFileLabels) {
                        await fileSystem.updateFileLabels(targetId, item.labels);
                        updatedCount++;
                    } else {
                        console.warn("No method to update file labels found");
                    }
                } else {
                    skippedCount++;
                }
            }

            // If the active file was updated, reload it
            if (files.find(f => f.id === activeFileId && incomingData.some(d => d.fileName === f.name))) {
                // Trigger a reload? Or just let the user re-select?
                // Ideally we update the `annotations` state if the active file is affected.
                const activeFile = files.find(f => f.id === activeFileId);
                const activeUpdate = incomingData.find(d => d.fileName === activeFile.name);
                if (activeUpdate) {
                    setAnnotations(activeUpdate.labels);
                }
            }

            return { success: true, updated: updatedCount, skipped: skippedCount };

        } catch (err) {
            console.error("Snapshot parse failed", err);
            return { success: false, error: err.message };
        }
    }, [files, activeFileId, fileSystem, setAnnotations]);

    return {
        exportProjectSnapshot,
        importProjectSnapshot
    };
};
