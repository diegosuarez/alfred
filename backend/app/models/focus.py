from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    duration = Column(Integer, nullable=False)  # Duration in seconds
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="focus_sessions")
