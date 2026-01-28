import os
import uuid
import shutil
import cv2
from pathlib import Path
from fastapi import HTTPException

from app.schemas.video import VideoInfo
from app.core.config import get_settings
from app.utils.file_io import calculate_partial_hash
import json

class VideoService:
    def __init__(self):
        self.settings = get_settings()
        # We'll use the uploads dir defined implicitly by main.py structure
        self.base_uploads_dir = Path(os.getcwd()) / "uploads"
        self.temp_dir = self.base_uploads_dir / "temp"
        self.videos_dir = self.base_uploads_dir / "videos"
        self.thumbnails_dir = self.base_uploads_dir / "thumbnails"
        self.registry_file = self.base_uploads_dir / "video_registry.json"
        
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.videos_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    def _load_registry(self) -> dict:
        if self.registry_file.exists():
            try:
                with open(self.registry_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return {}
        return {}

    def _save_registry(self, registry: dict):
        with open(self.registry_file, 'w') as f:
            json.dump(registry, f, indent=2)

    def init_upload(self, filename: str, total_size: int) -> str:
        """Initialize a new upload session."""
        upload_id = str(uuid.uuid4())
        # Create an empty file for appending
        temp_file = self.temp_dir / f"{upload_id}.part"
        with open(temp_file, "wb") as f:
            pass
        return upload_id

    async def save_chunk(self, upload_id: str, chunk: bytes):
        """Append a chunk to the temporary file."""
        temp_file = self.temp_dir / f"{upload_id}.part"
        if not temp_file.exists():
             raise HTTPException(status_code=404, detail="Upload session not found")
        
        with open(temp_file, "ab") as f:
            f.write(chunk)
            
    def finalize_upload(self, upload_id: str, original_filename: str) -> VideoInfo:
        """Finalize the upload, duplicate check, move file, and extract metadata."""
        temp_file = self.temp_dir / f"{upload_id}.part"
        if not temp_file.exists():
            raise HTTPException(status_code=404, detail="Upload session not found")
        
        # 1. Calculate Hash for Deduplication
        file_hash = calculate_partial_hash(temp_file)
        registry = self._load_registry()
        
        if file_hash in registry:
            existing_rel_path = registry[file_hash]
            existing_full_path = self.base_uploads_dir / existing_rel_path
            
            if existing_full_path.exists():
                # DUPLICATE FOUND
                # Delete the new temp file
                os.remove(temp_file)
                # Return metadata of existing file
                return self._extract_metadata(existing_full_path, existing_full_path.name)
            else:
                # Stale registry entry, remove it
                del registry[file_hash]
        
        # 2. Proceed with new save
        # Sanitize filename to avoid collisions or path traversal
        # We prepend upload_id to ensure uniqueness
        safe_filename = f"{upload_id}_{original_filename.replace(' ', '_')}"
        final_path = self.videos_dir / safe_filename
        
        # Move file from temp to videos
        shutil.move(str(temp_file), str(final_path))
        
        # 3. Save to Registry
        registry[file_hash] = f"videos/{safe_filename}"
        self._save_registry(registry)
        
        # Extract metadata and thumbnail
        return self._extract_metadata(final_path, safe_filename)

    def _extract_metadata(self, file_path: Path, filename: str) -> VideoInfo:
        """Use OpenCV to extract video metadata and generate a thumbnail."""
        cap = cv2.VideoCapture(str(file_path))
        if not cap.isOpened():
            # If we can't open it, maybe it's corrupt. 
            # We still return basic info but warn? 
            # For now, raise error.
            raise HTTPException(status_code=400, detail="Invalid video file: Could not read metadata")
            
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0.0
        
        # Generate Thumbnail
        thumbnail_url = None
        ret, frame = cap.read()
        if ret:
            thumb_name = f"{file_path.stem}_thumb.jpg"
            thumb_path = self.thumbnails_dir / thumb_name
            cv2.imwrite(str(thumb_path), frame)
            # URL convention based on main.py mounting
            thumbnail_url = f"/static/uploads/thumbnails/{thumb_name}"
            
        cap.release()
        
        video_url = f"/static/uploads/videos/{filename}"
        
        return VideoInfo(
            filename=filename,
            width=width,
            height=height,
            fps=fps,
            duration=duration,
            frame_count=frame_count,
            thumbnail_url=thumbnail_url,
            video_url=video_url
        )

def get_video_service():
    """FastAPI Dependency"""
    return VideoService()
