/**
 * IndexedDB Database using Dexie.js
 * 
 * Schema for file management with hybrid storage strategy.
 */

import Dexie from 'dexie';

export const db = new Dexie('ImageLabelingDB');

// Define schema
// Note: Only indexed fields are listed in the schema string.
// blob, thumbnail, label_data are stored but not indexed for performance.
db.version(2).stores({
    files: '++id, name, baseName, type, status, retry_count, backend_url, paired_label_id, created_at',
    // Additional table for label files if needed separately
    labels: '++id, name, type, status, backend_url, paired_image_id, created_at',
    // Global settings (e.g., classes.txt content)
    settings: 'key'
});

// File status constants
export const FileStatus = {
    PENDING: 'pending',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    ERROR: 'error',
    MISSING_IMAGE: 'missing-image',
    MISSING_LABEL: 'missing-label'
};

// Helper to check if we're running low on quota
export async function checkStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedMB = (estimate.usage || 0) / (1024 * 1024);
        const quotaMB = (estimate.quota || 0) / (1024 * 1024);
        const percentUsed = (usedMB / quotaMB) * 100;

        return {
            usedMB: usedMB.toFixed(2),
            quotaMB: quotaMB.toFixed(2),
            percentUsed: percentUsed.toFixed(1),
            isLow: percentUsed > 80 // Warn if over 80%
        };
    }
    return null;
}

export default db;
