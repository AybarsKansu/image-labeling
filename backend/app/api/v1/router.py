"""
API v1 Router.
Aggregates all endpoint routers.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import inference, models, training, tools, files

router = APIRouter()

router.include_router(inference.router)
router.include_router(models.router)
router.include_router(training.router)
router.include_router(tools.router)
router.include_router(files.router, tags=["files"])

