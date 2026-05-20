from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.core.time import utcnow

class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    duration = Column(Integer, nullable=False)  # Duration in seconds
    created_at = Column(DateTime, default=utcnow)

    task = relationship("Task", back_populates="focus_sessions")
