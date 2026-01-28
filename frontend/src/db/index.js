/**
 * IndexedDB Database using Dexie.js
 * 
 * Schema for file management with hybrid storage strategy.
 * Version 3: Added 'path' for hierarchical file explorer.
 */

import Dexie from 'dexie';

export const db = new Dexie('ImageLabelingDB');

// Define schema
// Note: Only indexed fields are listed in the schema string.
// blob, thumbnail, label_data are stored but not indexed for performance.
// Define schema
// Note: Only indexed fields are listed in the schema string.
// blob, thumbnail, label_data are stored but not indexed for performance.
db.version(4).stores({
    projects: 'id, name, created_at, updated_at', // New projects table
    files: '++id, name, baseName, path, type, status, retry_count, backend_url, paired_label_id, created_at, project_id', // Added project_id
    settings: 'key'
}).upgrade(async tx => {
    // Migration: Move existing files to a default "Legacy Project"
    const defaultProjectId = crypto.randomUUID();

    await tx.table('projects').add({
        id: defaultProjectId,
        name: 'My First Project',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        thumbnail: null,
        file_count: 0 // Will need recalc
    });

    // Update all existing files
    await tx.table('files').toCollection().modify({ project_id: defaultProjectId });
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
