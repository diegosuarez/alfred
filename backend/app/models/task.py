from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, inspect
from sqlalchemy.orm import relationship
from app.database import Base
from app.core.time import utcnow

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    priority = Column(String, default="medium", nullable=False)  # low, medium, high
    due_date = Column(DateTime, nullable=True)
    position = Column(Integer, default=0, nullable=False)
    
    column_id = Column(Integer, ForeignKey("columns.id", ondelete="CASCADE"), nullable=False)
    board_id = Column(Integer, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    board = relationship("Board", back_populates="tasks")
    column = relationship("Column", back_populates="tasks")
    focus_sessions = relationship("FocusSession", back_populates="task", cascade="all, delete-orphan")
    tags = relationship(
        "Tag",
        secondary="task_tags",
        back_populates="tasks",
        order_by="Tag.name",
    )
    subtasks = relationship(
        "SubTask",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="SubTask.position",
    )

    @property
    def total_focus_time(self) -> int:
        # Avoid triggering a lazy load in async contexts: only sum if
        # the relationship was eagerly loaded by the caller.
        if "focus_sessions" in inspect(self).unloaded:
            return 0
        return sum(session.duration for session in self.focus_sessions)
