/**
 * useBackgroundSync Hook
 * 
 * Manages background file uploads with:
 * - Priority queue (active file jumps to front)
 * - Throttled uploads (batch size configurable)
 * - Automatic blob purging after sync
 * - Flush mode for export preparation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import db, { FileStatus } from '../db/index';
import { getPendingFiles, setFileSyncing, markFileSynced, markFileError, updateFile } from '../db/fileOperations';

const API_BASE = 'http://localhost:8000/api';
const BATCH_SIZE = 2;
const POLL_INTERVAL = 3000; // 3 seconds

export function useBackgroundSync(activeFileId = null) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadQueue, setUploadQueue] = useState([]);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
    const [isFlushing, setIsFlushing] = useState(false);

    const activeFileIdRef = useRef(activeFileId);
    const isUploadingRef = useRef(false);

    // Keep activeFileId ref updated
    useEffect(() => {
        activeFileIdRef.current = activeFileId;
    }, [activeFileId]);

    /**
     * Main sync loop - polls for pending files and uploads them.
     */
    useEffect(() => {
        const syncLoop = async () => {
            if (isUploadingRef.current) return;

            try {
                // Get pending files
                let pending = await getPendingFiles(BATCH_SIZE * 2);

                if (pending.length === 0) {
                    setUploadProgress({ current: 0, total: 0 });
                    return;
                }

                // Priority: Move active file to front if it's pending
                if (activeFileIdRef.current) {
                    const activeIndex = pending.findIndex(f => f.id === activeFileIdRef.current);
                    if (activeIndex > 0) {
                        const [activeFile] = pending.splice(activeIndex, 1);
                        pending.unshift(activeFile);
                    }
                }

                // Take batch
                const batch = pending.slice(0, BATCH_SIZE);
                setUploadQueue(batch);
                setUploadProgress({ current: 0, total: batch.length });

                await uploadBatch(batch);

            } catch (err) {
                console.error('Sync loop error:', err);
            }
        };

        const interval = setInterval(syncLoop, POLL_INTERVAL);

        // Run immediately on mount
        syncLoop();

        return () => clearInterval(interval);
    }, []);

    /**
     * Upload a batch of files.
     */
    const uploadBatch = useCallback(async (batch) => {
        isUploadingRef.current = true;
        setIsUploading(true);

        for (let i = 0; i < batch.length; i++) {
            const file = batch[i];

            try {
                // Safety: Ensure both blob and pending status exist
                if (!file.blob || file.status !== FileStatus.PENDING) {
                    // Update status to reflecting reality if needed
                    if (!file.blob) await markFileError(file.id, 'Missing blob data');
                    continue;
                }

                // Mark as syncing
                await setFileSyncing(file.id);
                setUploadProgress(prev => ({ ...prev, current: i + 1 }));

                // Prepare form data
                const formData = new FormData();
                formData.append('file', file.blob, file.name);
                formData.append('file_id', file.id);

                if (file.label_data) {
                    formData.append('label_data', file.label_data);
                }

                // Upload
                const response = await axios.post(`${API_BASE}/files/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 60000 // 60 seconds per file
                });

                if (response.data && response.data.url) {
                    // Success: Mark synced and purge blob
                    await markFileSynced(file.id, response.data.url);
                } else {
                    throw new Error('Invalid response from server');
                }

            } catch (err) {
                console.error(`Failed to upload ${file.name}:`, err);

                // Retry logic: allow up to 3 retries
                const currentRetries = (file.retry_count || 0) + 1;

                if (currentRetries < 3) {
                    // Put back to pending for retry
                    await updateFile(file.id, {
                        status: FileStatus.PENDING,
                        retry_count: currentRetries,
                        error: `Retry ${currentRetries}/3: ${err.message}`
                    });
                } else {
                    // Final error
                    await markFileError(file.id, `Upload failed after 3 attempts: ${err.message}`);
                    await updateFile(file.id, { retry_count: currentRetries });
                }
            }
        }

        isUploadingRef.current = false;
        setIsUploading(false);
        setUploadQueue([]);
    }, []);

    /**
     * Force flush: Upload all pending files immediately.
     * Used before export to ensure server has all data.
     */
    const flushPending = useCallback(async () => {
        setIsFlushing(true);

        try {
            let pending = await getPendingFiles(1000); // Get all pending

            if (pending.length === 0) {
                setIsFlushing(false);
                return { success: true, count: 0 };
            }

            setUploadProgress({ current: 0, total: pending.length });

            // Upload in batches
            for (let i = 0; i < pending.length; i += BATCH_SIZE) {
                const batch = pending.slice(i, i + BATCH_SIZE);
                await uploadBatch(batch);
                setUploadProgress(prev => ({ ...prev, current: Math.min(i + BATCH_SIZE, pending.length) }));
            }

            setIsFlushing(false);
            return { success: true, count: pending.length };

        } catch (err) {
            setIsFlushing(false);
            return { success: false, error: err.message };
        }
    }, [uploadBatch]);

    /**
     * Prioritize a specific file (move to front of queue).
     */
    const prioritizeFile = useCallback(async (fileId) => {
        // This is handled automatically via activeFileIdRef in the sync loop
        // But we can also trigger an immediate sync if needed
        const file = await db.files.get(fileId);

        if (file && file.status === FileStatus.PENDING && file.blob) {
            await uploadBatch([file]);
        }
    }, [uploadBatch]);

    /**
     * Retry failed uploads.
     */
    const retryFailed = useCallback(async () => {
        const failed = await db.files.where('status').equals(FileStatus.ERROR).toArray();

        if (failed.length === 0) return;

        // Reset to pending
        await Promise.all(failed.map(f =>
            updateFile(f.id, { status: FileStatus.PENDING, error: null })
        ));

    }, []);

    return {
        isUploading,
        isFlushing,
        uploadQueue,
        uploadProgress,

        flushPending,
        prioritizeFile,
        retryFailed
    };
}

export default useBackgroundSync;
