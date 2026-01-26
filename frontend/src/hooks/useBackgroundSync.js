/**
 * useBackgroundSync Hook
 * 
 * Manages background file uploads with:
 * - Sequential Queue with Concurrency Limit (max 2)
 * - Mandatory Delay between batches (200ms)
 * - Priority queue (active file jumps to front)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import db, { FileStatus } from '../db/index';
import { getPendingFiles, setFileSyncing, markFileSynced, markFileError, updateFile } from '../db/fileOperations';

const API_BASE = 'http://localhost:8000/api';
const CONCURRENCY_LIMIT = 2;
const BATCH_DELAY = 200; // ms
const POLL_INTERVAL = 3000; // ms

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
     * Controlled sync loop.
     */
    useEffect(() => {
        let isStopped = false;

        const syncLoop = async () => {
            if (isStopped || isUploadingRef.current) return;

            try {
                // Get pending files (batch size = concurrency * 5 to have a buffer)
                let pending = await getPendingFiles(CONCURRENCY_LIMIT * 5);

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

                // Take batch based on concurrency limit
                const batch = pending.slice(0, CONCURRENCY_LIMIT);
                setUploadQueue(batch);

                // For progress bar, we want to know how many are pending total
                const totalPendingCount = await db.files.where('status').equals(FileStatus.PENDING).count();
                const totalSyncedCount = await db.files.where('status').equals(FileStatus.SYNCED).count();
                setUploadProgress({
                    current: totalSyncedCount,
                    total: totalPendingCount + totalSyncedCount
                });

                await uploadBatch(batch);

                // Mandatory delay before next batch to avoid overwhelming backend
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));

            } catch (err) {
                console.error('Sync loop error:', err);
            }
        };

        const interval = setInterval(syncLoop, POLL_INTERVAL);
        syncLoop();

        return () => {
            isStopped = true;
            clearInterval(interval);
        };
    }, []);

    /**
     * Upload a batch using Promise.all for limited concurrency.
     */
    const uploadBatch = useCallback(async (batch) => {
        isUploadingRef.current = true;
        setIsUploading(true);

        // Upload batch items in parallel (up to concurrency limit)
        await Promise.all(batch.map(file => uploadSingleFile(file)));

        isUploadingRef.current = false;
        setIsUploading(false);
        setUploadQueue([]);
    }, []);

    /**
     * Handle single file upload logic.
     */
    const uploadSingleFile = async (file) => {
        try {
            // Safety: Ensure both blob and pending status exist
            if (!file.blob || file.status !== FileStatus.PENDING) {
                if (!file.blob) await markFileError(file.id, 'Missing blob data');
                return;
            }

            // Mark as syncing
            await setFileSyncing(file.id);

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
                await updateFile(file.id, {
                    status: FileStatus.PENDING,
                    retry_count: currentRetries,
                    error: `Retry ${currentRetries}/3: ${err.message}`
                });
            } else {
                await markFileError(file.id, `Upload failed after 3 attempts: ${err.message}`);
                await updateFile(file.id, { retry_count: currentRetries });
            }
        }
    };

    /**
     * Force flush: Upload all pending files immediately.
     */
    const flushPending = useCallback(async () => {
        setIsFlushing(true);

        try {
            let pending = await getPendingFiles(2000);

            if (pending.length === 0) {
                setIsFlushing(false);
                return { success: true, count: 0 };
            }

            // Process in sequential chunks
            for (let i = 0; i < pending.length; i += CONCURRENCY_LIMIT) {
                const batch = pending.slice(i, i + CONCURRENCY_LIMIT);
                await uploadBatch(batch);
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }

            setIsFlushing(false);
            return { success: true, count: pending.length };

        } catch (err) {
            setIsFlushing(false);
            return { success: false, error: err.message };
        }
    }, [uploadBatch]);

    /**
     * Prioritize a specific file.
     */
    const prioritizeFile = useCallback(async (fileId) => {
        const file = await db.files.get(fileId);
        if (file && file.status === FileStatus.PENDING && file.blob) {
            await uploadSingleFile(file);
        }
    }, []);

    /**
     * Retry failed uploads.
     */
    const retryFailed = useCallback(async () => {
        const failed = await db.files.where('status').equals(FileStatus.ERROR).toArray();
        if (failed.length === 0) return;

        await Promise.all(failed.map(f =>
            updateFile(f.id, { status: FileStatus.PENDING, error: null, retry_count: 0 })
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
