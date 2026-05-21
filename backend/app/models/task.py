from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, inspect
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


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
    # Self-referential FK so any task can hang under another. Top-level
    # tasks have parent_task_id NULL. Cascade on delete so removing a
    # parent also removes its children.
    parent_task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Independent "done" flag — useful for child tasks (you tick them
    # without moving them between columns). Top-level tasks can also use
    # it but typically rely on column-based status.
    completed = Column(Boolean, nullable=False, default=False, server_default="0")

    # NULL while the task is "live" on the kanban. When set, the task is
    # archived: hidden from the board detail and only surfaced via the
    # column's archived-tasks view.
    archived_at = Column(DateTime, nullable=True, index=True)

    # Who asked for the task. SET NULL on contact delete so the task
    # survives and just becomes "no requester".
    requester_id = Column(
        Integer,
        ForeignKey("contacts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

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
    parent = relationship("Task", remote_side="Task.id", back_populates="children")
    children = relationship(
        "Task",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="Task.position",
        single_parent=True,
    )
    requester = relationship(
        "Contact",
        back_populates="requested_tasks",
        foreign_keys=[requester_id],
    )
    assignees = relationship(
        "Contact",
        secondary="task_assignees",
        back_populates="assigned_tasks",
        order_by="Contact.name",
    )
    reminders = relationship(
        "Reminder",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="Reminder.remind_at",
    )
    attachments = relationship(
        "Attachment",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="Attachment.created_at",
    )

    @property
    def total_focus_time(self) -> int:
        # Avoid triggering a lazy load in async contexts: only sum if
        # the relationship was eagerly loaded by the caller.
        if "focus_sessions" in inspect(self).unloaded:
            return 0
        return sum(session.duration for session in self.focus_sessions)
