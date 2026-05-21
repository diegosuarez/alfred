from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


class Attachment(Base):
    """A file attached to a Task. The bytes live on disk under
    data/attachments/<id>.<ext>; the row captures the original filename,
    MIME type and size so the SPA can render the right preview."""

    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Original filename as uploaded; used for the download Content-Disposition.
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    # Path relative to data/attachments/. Kept opaque so the storage
    # backend can evolve without touching the schema.
    storage_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    task = relationship("Task", back_populates="attachments")
