# Backend Architecture & Implementation Audit

**Date:** 2026-02-01
**Status:** Audit Completed
**Scope:** Backend (`backend/`)

This document provides a strictly factual overview of the current backend implementation based on a code audit. It describes "what exists right now," not "what was planned."

---

## 1. High-Level Architecture

The backend is a **Monolithic FastAPI Application** serving a computer vision labeling and training system.
- **Entry Point:** `app.main:app` (Factory pattern used in `create_app`).
- **Database:** SQLite (`image_labeling.db`) using SQLAlchemy ORM.
- **File System:** Heavily relied upon for storing images, labels, and models. The DB acts primarily as an index for files on disk.

### Key Directories
- `app/` - Application source code.
- `app/api/` - Routers and Endpoints.
- `app/services/` - Business logic (CRUD, File IO, AI interaction).
- `storage/projects/` - **Primary Data Store.** Each project has its own folder here.
- `models/` - Stores YOLO/SAM/DINO model weights.

---

## 2. Core Components

### A. Data Flow & Synchronization
**Current State:** Direct Synchronous Upload
Unlike a "temp folder" or "chunked upload" system, the current implementation uses a direct synchronization approach.

1.  **Endpoint:** `POST /api/projects/{project_id}/sync`
    *   **Handler:** `app.api.endpoints.projects.sync_project_data`
    *   **Logic:**
        1.  Receives `file` (Image), `image_name`, `annotations` (JSON), and `aug_params`.
        2.  Decodes the image using OpenCV (`cv2.imdecode`).
        3.  Calls `DatasetService.save_annotation` immediately.
        4.  **Writes to Disk:** Saves the image to `storage/projects/{id}/raw_data/images/{name}`.
        5.  **Writes Label:** Saves annotations (json/txt) to `raw_data/labels/`.
        6.  **No Temp State:** There is no intermediate "temp" state observed in the active code. Use of `upload-temp` or `commit` endpoints was **not found** in `projects.py`.

### B. Database Schema (`sql_models.py`)
The database is minimal and tightly coupled to the file system structure.

1.  **Project Table:**
    *   `id` (UUID), `name`, `path` (Physical path on disk).
    *   Acts as the root for file organization.
2.  **Image Table:**
    *   `filename`, `project_id`, `is_labeled` (Boolean flag).
    *   **Note:** Does NOT store the image binary. It only stores the filename. The app assumes the file exists at `{project.path}/raw_data/images/{filename}`.
3.  **Task Table:**
    *   Used for tracking long-running jobs like "training".
    *   Stores `progress` (Float), `status`, and `result` (JSON).

### C. Services Layer

#### 1. ProjectService (`project_service.py`)
*   **Role:** Manages the lifecycle of a Project (Create, List, Delete).
*   **Folder Structure Enforcement:** Ensures every project has `raw_data/images`, `raw_data/labels`, `models/`, `jobs/`.
*   **Disk Sync:** Has a `sync_projects_from_disk` features that scans the `storage/projects` folder and auto-registers unknown folders as projects in SQLite.

#### 2. DatasetService (`dataset_service.py`)
*   **Role:** The "Heavy lifter" for I/O and Image Processing.
*   **Capabilities:**
    *   **Saving:** Handles writing Images and Labels (supporting both `.txt` YOLO and custom `.json`/`.toon` formats).
    *   **Augmentation:** Performs on-the-fly augmentation (Flip, Rotate, Brightness) using OpenCV if `aug_params` are passed during sync.
    *   **Preprocessing:** Can tile large images and resize them (`preprocess_dataset`).
    *   **Training Prep:** detailed logic (`prepare_multi_project_training_job`) to copy files to a temp staging area (`backend/temp/training_jobs`), normalize class names, and split Train/Val (80/20) for YOLO training.

#### 3. ModelManager
*   **Role:** Loads and caches ML models (YOLO, SAM, etc.) to manage VRAM usage.
*   *(Inferred from context, explicit file read was partial)*: It likely handles the `.pt` file loading and inference calls.

---

## 3. Notable Observations & discrepancies

1.  **"Temp" vs "Direct" Upload:**
    *   The active `projects.py` endpoint file **DOES NOT** contain `/upload-temp` or `/commit` endpoints.
    *   The active `project_service.py` **DOES NOT** have `commit_temp_files` method.
    *   **Conclusion:** The backend is currently running in **Direct Upload Mode**. Files sent by frontend are saved permanently immediately.

2.  **Static File Serving:**
    *   `main.py` mounts `/static/projects` pointing to `backend/storage/projects`.
    *   This allows the Frontend to load images via simple URL (`src="http://host/static/projects/{id}/..."`) instead of fetching via API.

3.  **Error Handling:**
    *   Global exception handler is in place in `main.py`.
    *   Most services catch exceptions and print to console (`traceback.print_exc()`) before re-raising or returning error statuses.

---

## 4. Recommendations for Next Steps

*   **Restore Temp Upload (Optional):** If the efficient "Temp -> Commit" flow was desired, it is currently **missing** from the codebase and needs to be re-implemented.
*   **Database Sync:** The `sync_projects_from_disk` is a strong feature for recovery, but relying on it implies the File System is the "Source of Truth", not the Database.
