
import db, { FileStatus } from './index';

/**
 * Projects Operations
 */

// Create a new project
export async function createProject(name) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.projects.add({
        id,
        name,
        created_at: now,
        updated_at: now,
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
