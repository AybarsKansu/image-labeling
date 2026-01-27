import uuid
import logging
import asyncio
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Body
from pydantic import BaseModel

from app.services.evaluation.benchmark import BenchmarkManager
from app.services.evaluation.analysis import FailureAnalyzer
from app.services.evaluation.optimization import ModelOptimizer
from app.api.v1.endpoints.task_store import create_task, update_task, get_task, TaskStatus

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Schemas ---
class BenchmarkRequest(BaseModel):
    models: List[str]
    test_set_config: str # Path to data.yaml or name like 'coco8.yaml'

class OptimizeRequest(BaseModel):
    model_name: str
    format: str = "onnx"

class TaskResponse(BaseModel):
    task_id: str
    status: str

# --- Background Workers ---
async def run_benchmark_task(task_id: str, request: BenchmarkRequest):
    try:
        update_task(task_id, TaskStatus.PROCESSING)
        
        # Initialize Manager
        # Note: Ideally caching the manager or passing dependency, but for now new instance is safer for config changes
        manager = BenchmarkManager(test_set_path=request.test_set_config, warmup_steps=5)
        
        # Run - Convert DataFrame to dict
        df = manager.run_benchmarks(request.models)
        results = df.to_dict(orient="records")
        
        update_task(task_id, TaskStatus.COMPLETED, result=results)
    except Exception as e:
        logger.error(f"Benchmark task {task_id} failed: {e}")
        update_task(task_id, TaskStatus.FAILED, error=str(e))

async def run_optimization_task(task_id: str, request: OptimizeRequest):
    try:
        update_task(task_id, TaskStatus.PROCESSING)
        
        # Dummy benchmark manager needed for optimizer initialization
        # We won't use it heavily unless compare is called inside optim, 
        # but ModelOptimizer constructor needs it.
        # We'll point to a dummy config or the user's default if known.
        dummy_manager = BenchmarkManager(test_set_path="coco8.yaml", warmup_steps=1)
        optimizer = ModelOptimizer(benchmark_manager=dummy_manager)
        
        # Export
        exported_path = optimizer.export_model(request.model_name, format=request.format)
        
        # Compare (Optional but good)
        # compare_formats calls run_benchmarks internally
        comparison_df = optimizer.compare_formats(request.model_name, formats=[request.format])
        results = comparison_df.to_dict(orient="records")
        
        update_task(task_id, TaskStatus.COMPLETED, result=results)
    except Exception as e:
        logger.error(f"Optimization task {task_id} failed: {e}")
        update_task(task_id, TaskStatus.FAILED, error=str(e))


# --- Endpoints ---

@router.post("/benchmark", response_model=TaskResponse)
async def start_benchmark(
    request: BenchmarkRequest, 
    background_tasks: BackgroundTasks
):
    """
    Starts a benchmarking background task.
    """
    task_id = str(uuid.uuid4())
    create_task(task_id)
    
    # Add to background tasks
    background_tasks.add_task(run_benchmark_task, task_id, request)
    
    return TaskResponse(task_id=task_id, status="pending")

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    Polls the status of a background task.
    """
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.get("/failures/{model_id}")
async def get_failures(model_id: str, test_set_path: str = "coco8.yaml"):
    """
    Runs failure analysis synchronously (can be slow, but usually instant return if already cached or analysis is quick).
    For now, let's make it simple: trigger analysis and return paths. 
    In PROD, this should also be async if dataset is huge.
    """
    try:
        # We need a directory for images.
        # This part is tricky via API without persistent config.
        # For MVP, we presume test_set_path is accessible.
        
        analyzer = FailureAnalyzer(test_set_path=test_set_path)
        # This runs analysis AND saves images
        analyzer.analyze_model(model_id)
        
        # Return listing of generated images
        # Output dir is runs/analysis/failures/debug_images/{model_name}
        import os
        from pathlib import Path
        model_name = Path(model_id).stem
        debug_dir = analyzer.output_dir / "debug_images" / model_name
        
        images = []
        if debug_dir.exists():
            # For API to serve images, they need to be static mounted OR read as bytes.
            # We'll just return paths for now, Frontend needs a way to view them.
            # Ideally backend serves 'runs' folder as static.
            for img in debug_dir.iterdir():
                if img.suffix in ['.jpg', '.png']:
                    # Construct a URL assuming static mount exists
                    # We will need to mount 'runs' in main.py
                    images.append(f"/static/runs/analysis/failures/debug_images/{model_name}/{img.name}")
                    
        return {"model": model_id, "images": images}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/optimize", response_model=TaskResponse)
async def start_optimize(
    request: OptimizeRequest,
    background_tasks: BackgroundTasks
):
    """
    Starts model optimization background task.
    """
    task_id = str(uuid.uuid4())
    create_task(task_id)
    background_tasks.add_task(run_optimization_task, task_id, request)
    return TaskResponse(task_id=task_id, status="pending")
