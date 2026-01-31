from typing import Optional, Dict, Any
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.sql_models import Task
from app.schemas.tasks import TaskResult, TaskStatus
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)

class TaskService:
    def __init__(self, db: Session):
        self.db = db

    def create_task(self, type: str = "generic") -> TaskResult:
        """Creates a new Pending task in DB."""
        db_task = Task(type=type, status=TaskStatus.PENDING, progress=0.0)
        self.db.add(db_task)
        self.db.commit()
        self.db.refresh(db_task)
        return self._to_schema(db_task)

    def update_task(self, task_id: str, status: TaskStatus = None, progress: float = None, message: str = None, result: Any = None, error: str = None):
        """Updates an existing task."""
        db_task = self.db.query(Task).filter(Task.id == task_id).first()
        if not db_task:
            logger.warning(f"Task {task_id} not found to update.")
            return

        if status: db_task.status = status
        if progress is not None: db_task.progress = progress
        if message: db_task.message = message
        if result: db_task.result = result
        if error: db_task.error = error
        
        db_task.updated_at = datetime.now()
        
        self.db.commit()

    def get_task(self, task_id: str) -> Optional[TaskResult]:
        """Retrieves task from DB."""
        db_task = self.db.query(Task).filter(Task.id == task_id).first()
        if not db_task:
            return None
        return self._to_schema(db_task)

    def _to_schema(self, db_task: Task) -> TaskResult:
        return TaskResult(
            task_id=db_task.id,
            type=db_task.type,
            status=db_task.status,
            progress=db_task.progress,
            message=db_task.message,
            result=db_task.result,
            error=db_task.error,
            created_at=db_task.created_at
        )
