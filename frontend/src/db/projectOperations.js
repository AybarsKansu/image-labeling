import axios from 'axios';
import { API_URL } from '../constants/config';
import db, { FileStatus } from './index';

/**
 * Projects Operations
 */

// Sync projects from backend disk to local Dexie
export async function syncBackendProjects() {
    try {
        // 1. Tell backend to scan its storage folder
        await axios.post(`${API_URL}/projects/sync-disk`);

        // 2. Fetch the list of projects the backend now knows about
        const response = await axios.get(`${API_URL}/projects`);
        const backendProjects = response.data;

        if (!Array.isArray(backendProjects)) return { success: false, error: 'Invalid response from server' };

        let addedCount = 0;

        // 3. For each backend project, ensure it exists in our local Dexie
        for (const bp of backendProjects) {
            const local = await db.projects.get(bp.id);
            if (!local) {
                await db.projects.add({
                    id: bp.id,
                    name: bp.name,
                    description: bp.description || '',
                    created_at: bp.created_at,
                    updated_at: bp.created_at,
                    thumbnail: null,
                    file_count: bp.file_count || 0
                });
                addedCount++;
            } else {
                // Optionally update stats if it already exists
                await db.projects.update(bp.id, {
                    file_count: bp.file_count || local.file_count
                });
            }
        }

        return { success: true, added: addedCount };
    } catch (err) {
        console.error("Failed to sync backend projects:", err);
        return { success: false, error: err.message };
    }
}

// Create a new project with optional name (auto-generates if not provided)
export async function createProject(name) {
    const id = crypto.randomUUID();
    const now = new Date();
    const nowISO = now.toISOString();

    // Auto-generate name if not provided
    if (!name || name.trim() === '') {
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const day = now.getDate();
        const month = months[now.getMonth()];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        name = `Proje - ${day} ${month} ${hours}:${minutes}`;
    }

    await db.projects.add({
        id,
        name,
        created_at: nowISO,
        updated_at: nowISO,
        thumbnail: null,
        file_count: 0
    });

    return id;
}

// Get all projects sorted by last updated
export async function getRecentProjects() {
    // Dexie doesn't support direct sorting by date string efficiently without index, 
    // but we indexed updated_at.
    return await db.projects.orderBy('updated_at').reverse().toArray();
}

// Get single project
export async function getProject(id) {
    return await db.projects.get(id);
}

// Update project metadata (e.g. name, thumbnail)
export async function updateProject(id, changes) {
    changes.updated_at = new Date().toISOString();
    return await db.projects.update(id, changes);
}

// Delete project and all its files
export async function deleteProject(id) {
    return db.transaction('rw', db.projects, db.files, async () => {
        // Delete all files belonging to this project
        await db.files.where('project_id').equals(id).delete();
        // Delete the project itself
        await db.projects.delete(id);
    });
}
