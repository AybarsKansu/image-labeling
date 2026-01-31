"""
API Router.
Aggregates all endpoint routers.
"""

from fastapi import APIRouter

from app.api.endpoints import inference, models, training, tools, videos, projects

router = APIRouter()

router.include_router(inference.router)
router.include_router(models.router)
router.include_router(training.router)
router.include_router(tools.router)
router.include_router(videos.router)
router.include_router(projects.router, prefix="/projects", tags=["projects"])

