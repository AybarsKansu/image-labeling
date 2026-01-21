"""
Application lifecycle events.
Startup and shutdown handlers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.core.config import get_settings
from app.services.model_manager import get_model_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager.
    Handles startup and shutdown events.
    """
    # Startup
    print("=" * 50)
    print("Starting Image Labeling API...")
    print("=" * 50)
    
    settings = get_settings()
    
    # Ensure directories exist
    settings.images_dir.mkdir(parents=True, exist_ok=True)
    settings.labels_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize model manager and scan for models
    model_manager = get_model_manager()
    model_manager.scan_models()
    
    print(f"Loaded {len(model_manager.list_models())} models")
    print(f"Dataset directory: {settings.DATASET_DIR}")
    print("=" * 50)
    print("API Ready!")
    print("=" * 50)
    
    yield
    
    # Shutdown
    print("Shutting down Image Labeling API...")
    # Add any cleanup logic here if needed
