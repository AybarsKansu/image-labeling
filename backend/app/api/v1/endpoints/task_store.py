from typing import Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class TaskResult(BaseModel):
    task_id: str
    status: TaskStatus
    result: Optional[Any] = None
    error: Optional[str] = None

# In-memory storage
_tasks: Dict[str, TaskResult] = {}

def create_task(task_id: str) -> TaskResult:
    task = TaskResult(task_id=task_id, status=TaskStatus.PENDING)
    _tasks[task_id] = task
    return task

def update_task(task_id: str, status: TaskStatus, result: Any = None, error: str = None):
    if task_id in _tasks:
        _tasks[task_id].status = status
        _tasks[task_id].result = result
        _tasks[task_id].error = error
    else:
        logger.warning(f"Task {task_id} not found to update.")

def get_task(task_id: str) -> Optional[TaskResult]:
    return _tasks.get(task_id)
