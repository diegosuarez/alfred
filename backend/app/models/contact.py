from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
)
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


# Join table for the Task <-> Contact (assignees) many-to-many. CASCADE
# on both sides so deleting either side cleans up the link rows.
task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column(
        "task_id",
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "contact_id",
        Integer,
        ForeignKey("contacts.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Contact(Base):
    """A person in the user's address book — the person who asked for a
    task, or the person it's been delegated to. Contacts are local for
    now; future versions will sync from Google Contacts and populate
    `image_url` from the Google profile picture.
    """

    __tablename__ = "contacts"
    # No uniqueness on (user_id, email) on purpose: the same person can
    # legitimately appear in two Google accounts (personal + work) and
    # we want each side to keep its own row scoped to its account so the
    # picker can filter by context cleanly.

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    # Habitual contacts surface at the top of the picker.
    is_favorite = Column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # The synthetic "Yo mismo" row, one per user — always shown regardless
    # of context scoping and used as the default assignee for new tasks.
    is_self = Column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # 'manual' (created by hand via API) or 'google' (synced from a
    # Google account via the People API).
    source = Column(
        String, nullable=False, default="manual", server_default="manual"
    )
    # Stable identifier used to upsert on re-sync (e.g. "people/c12345").
    google_contact_id = Column(String, nullable=True, index=True)
    # Which connected Google account this contact came from. SET NULL on
    # account delete so the contact survives a disconnect.
    google_account_id = Column(
        Integer,
        ForeignKey("google_accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="contacts")
    requested_tasks = relationship(
        "Task",
        back_populates="requester",
        foreign_keys="[Task.requester_id]",
    )
    assigned_tasks = relationship(
        "Task",
        secondary=task_assignees,
        back_populates="assignees",
    )
