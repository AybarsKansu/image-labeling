"""
Image Labeling API - Main Entry Point.

A modular FastAPI application for Computer Vision tasks:
- YOLO object detection
- SAM segmentation
- Polygon editing and annotation
- Dataset management and training

Usage:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.events import lifespan
from app.api.router import router as api_router


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()
    
    from app.core.database import engine, Base
    from app.models import sql_models # Import models to register them
    
    # Create Tables
    Base.metadata.create_all(bind=engine)
    
    app = FastAPI(
        title="Image Labeling API",
        description="Computer Vision API for object detection, segmentation, and annotation",
        version="0.1.0",
        lifespan=lifespan
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include API router
    app.include_router(api_router, prefix="/api")
    
    # Mount static files for analysis runs
    from fastapi.staticfiles import StaticFiles
    import os
    runs_dir = os.path.join(os.getcwd(), "runs")
    if not os.path.exists(runs_dir):
        os.makedirs(runs_dir)
    app.mount("/static/runs", StaticFiles(directory=runs_dir), name="runs")
    
    # Mount static files for user uploads
    uploads_dir = os.path.join(os.getcwd(), "uploads")
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)
    app.mount("/static/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    
    # Mount projects storage
    storage_projects_dir = settings.STORAGE_DIR / "projects"
    storage_projects_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static/projects", StaticFiles(directory=str(storage_projects_dir)), name="projects")
    
    # Global exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Catch-all exception handler for unhandled errors."""
        print(f"Unhandled exception: {exc}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "detail": str(exc)}
        )
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy"}
    
    return app

# Create the application instance
app = create_app()