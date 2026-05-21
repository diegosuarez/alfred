from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


class Reminder(Base):
    """A one-shot alarm attached to a task. The SPA reads pending
    reminders on boot, schedules setTimeouts locally and dismisses
    them (DELETE) once the user acknowledges. There's no server-side
    scheduler — if the user is offline when the time hits, the
    reminder fires the next time they open the app.
    """

    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    remind_at = Column(DateTime, nullable=False, index=True)
    # When the server-side scheduler fired this reminder over Web Push.
    # NULL means "still pending"; once set, the loop skips it on the
    # next tick so the user doesn't get the same notification twice.
    sent_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow)

    task = relationship("Task", back_populates="reminders")
