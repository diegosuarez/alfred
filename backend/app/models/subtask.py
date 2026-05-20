from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


class SubTask(Base):
    """A lightweight checklist item under a parent Task. Subtasks don't have
    their own column or priority — they exist purely inside the parent
    task's detail. Completing them just flips a flag; column moves and
    focus sessions live on the parent only.
    """

    __tablename__ = "subtasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String, nullable=False)
    completed = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    task = relationship("Task", back_populates="subtasks")
