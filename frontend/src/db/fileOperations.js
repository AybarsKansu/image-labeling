/**
 * File Operations for IndexedDB
 * 
 * Handles CRUD operations with chunking for large batches.
 */

import db, { FileStatus } from './index';

/**
 * Add files to the database in chunks to prevent UI freeze.
 * @param {Array} files - Array of file objects { name, type, blob, thumbnail, label_data, status }
 * @param {number} chunkSize - Number of files to add per batch
 * @param {Function} onProgress - Callback for progress updates
 */
export async function addFilesInChunks(files, chunkSize = 50, onProgress = null) {
    const total = files.length;
    let added = 0;

    for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);

        await db.files.bulkAdd(chunk.map(f => ({
            name: f.name,
            type: f.type || 'image',
            blob: f.blob,
            thumbnail: f.thumbnail,
            label_data: f.label_data || null,
            status: f.status || FileStatus.PENDING,
            backend_url: null,
            paired_label_id: f.paired_label_id || null,
            created_at: new Date().toISOString()
        })));

        added += chunk.length;

        if (onProgress) {
            onProgress({ added, total, percent: Math.round((added / total) * 100) });
        }

        // Yield to main thread
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    return added;
}

/**
 * Get a file by ID.
 */
export async function getFile(id) {
    return db.files.get(id);
}

/**
 * Get all files (with optional status filter).
 */
export async function getAllFiles(status = null) {
    if (status) {
        return db.files.where('status').equals(status).toArray();
    }
    return db.files.toArray();
}

/**
 * Update a file record.
 */
export async function updateFile(id, updates) {
    return db.files.update(id, updates);
}

/**
 * Delete a file record.
 */
export async function deleteFile(id) {
    return db.files.delete(id);
}

/**
 * Purge blob from a synced file to save space.
 */
export async function purgeBlob(id) {
    return db.files.update(id, { blob: null });
}

/**
 * Get pending files for background sync.
 */
export async function getPendingFiles(limit = 10) {
    return db.files
        .where('status')
        .equals(FileStatus.PENDING)
        .limit(limit)
        .toArray();
}

/**
 * Set file status to syncing.
 */
export async function setFileSyncing(id) {
    return db.files.update(id, { status: FileStatus.SYNCING });
}

/**
 * Mark file as synced and purge blob.
 */
export async function markFileSynced(id, backendUrl) {
    return db.files.update(id, {
        status: FileStatus.SYNCED,
        backend_url: backendUrl,
        blob: null // Free up space
    });
}

/**
 * Mark file as error.
 */
export async function markFileError(id, errorMessage) {
    return db.files.update(id, {
        status: FileStatus.ERROR,
        error: errorMessage
    });
}

/**
 * Auto-cleanup old synced files to free quota.
 */
export async function cleanupOldSyncedFiles(olderThanDays = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const oldFiles = await db.files
        .where('status')
        .equals(FileStatus.SYNCED)
        .and(f => new Date(f.created_at) < cutoff)
        .toArray();

    const idsToDelete = oldFiles.map(f => f.id);
    await db.files.bulkDelete(idsToDelete);

    return idsToDelete.length;
}

/**
 * Save global settings (e.g., classes.txt content).
 */
export async function saveSetting(key, value) {
    return db.settings.put({ key, value });
}

/**
 * Get a global setting.
 */
export async function getSetting(key) {
    const record = await db.settings.get(key);
    return record ? record.value : null;
}
