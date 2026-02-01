# Frontend Architecture & Implementation Audit

**Date:** 2026-02-01
**Status:** Audit Completed
**Scope:** Frontend (`frontend/src/`)

This document provides a strictly factual overview of the current frontend implementation based on a code audit. It describes "what exists right now," not "what was planned."

---

## 1. High-Level Architecture

The frontend is a **Single Page Application (SPA)** built with React (Vite).
- **Local State:** Uses `Dexie.js` (IndexedDB wrapper) as a client-side persistent database.
- **Backend Communication:** `Axios` for REST API calls.
- **Workflow:** "Offline-First" approach. Users create projects and edit locally (IndexedDB), then "Save" (Sync) to the backend.

### Key Directories
- `src/db/` - Dexie database schema and operations.
- `src/hooks/` - Custom hooks managing complex logic (FileSystem, AI, etc.).
- `src/components/` - UI Components (Canvas, Modals, Panels).
- `src/workers/` - Web Workers for off-main-thread image processing.

---

## 2. Core Components

### A. File System & Data Sync (`useFileSystem.js`)
This is the "Brain" of the application handling file ingestion, storage, and synchronization.

1.  **Ingestion (`ingestFiles`):**
    *   Reads `File` objects from input.
    *   Stores them **directly** into IndexedDB (`db.files` table) as `Blob`s.
    *   **Status:** `PENDING`.
    *   **Note:** Does NOT upload immediately upon selection. It queues them locally.

2.  **Saving / Syncing (`saveProjectToBackend`):**
    *   **Handler:** `saveProjectToBackend` in `useFileSystem.js`.
    *   **Logic:**
        1.  Queries `db.files` for pending files (where `blob` is not null).
        2.  Iterates through them (Parallel batches of 5).
        3.  **Uploads:** Sends `POST` request to `/api/projects/{id}/sync` (Direct Upload Endpoint).
        4.  **On Success:**
            *   Clears the heavy `blob` from IndexedDB to free space.
            *   Sets `backend_url` to `/static/projects/{id}/raw_data/images/{name}`.
            *   Updates status to `SYNCED`.
    *   **Observation:** This confirms the "Direct Sync" strategy. Files move from Local Blob -> Backend Static File.

3.  **Pulling / Downloading (`syncWithBackend`):**
    *   **Logic:**
        1.  Fetches file list from `/api/projects/{id}/files`.
        2.  Compares with local DB.
        3.  Creates "Ghost" entries for new remote files: Metadata is created, but no image data is downloaded (`blob: null`).
        4.  This implements an **"On-Demand Loading"** strategy where images are only fetched (via `<img> src`) when displayed.

### B. Local Database (`db/index.js`, `projectOperations.js`)
*   **Projects Table:** Stores ID, Name, Created Date locally.
*   **Files Table:** Stores ID, Filename, Blob (if local), Backend URL (if synced), Annotations (JSON).
*   **Sync Logic:** `syncBackendProjects` (in `projectOperations.js`) calls `/api/projects/sync-disk` to force the backend to scan its folder, then fetches the project list to update local DB.

### C. AI & Inference (`useAIModels.js`)
*   *(Inferred from hooks folder presence)*: Handles sending images to `/api/inference/...` endpoints.
*   Likely converts frontend-friendly `backend_url` or `blob` into a format the backend accepts.

### D. UI/UX Structure
*   **Editor:** Main workspace.
*   **Canvas:** Uses `Konva` (likely) or native Canvas API for drawing boxes/polygons.
*   **Panels:** Sidebars for Properties and Layers.

---

## 3. Notable Observations & Discrepancies

1.  **No "Temp" Upload:**
    *   The frontend code in `useFileSystem.js` explicitly calls `/sync` (line 749).
    *   There is no definition or usage of an `upload-temp` endpoint.
    *   Uploads happen only when the user clicks "Save" (or triggers `saveProjectToBackend`), not immediately upon file selection.

2.  **Memory Management:**
    *   The `ingestFiles` function keeps Blobs in IndexedDB.
    *   **Risk:** If a user adds 10,000 images, IndexedDB consumption will spike *until* they click "Save". Only after saving are the blobs cleared. This confirms the user's previous concern about "IndexedDB Bloat" which the "Temp Upload" strategy was meant to solve, but which is **currently not implemented**.

---

## 4. Recommendations for Next Steps

*   **Re-implement Immediate Upload (Critical for Scale):**
    *   To support the user's goal of "10,000 images", the frontend *must* act more like a streaming uploader (Upload immediately to a temp folder, keep no local blob).
    *   Current implementations stores *everything* locally first, which is the bottleneck.
*   **Restore Temp/Commit Endpoints:**
    *   The frontend needs code to call `/upload-temp` immediately inside `ingestFiles`.
    *   It needs to call `/commit` inside `saveProjectToBackend`.
