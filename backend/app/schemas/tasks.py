from typing import Any, Optional, Dict
from enum import Enum
from pydantic import BaseModel
from datetime import datetime

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class TaskResult(BaseModel):
    task_id: str
    type: str = "generic"
    status: TaskStatus
    progress: float = 0.0
    message: Optional[str] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None
