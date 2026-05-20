from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base
from app.core.time import utcnow


class Context(Base):
    __tablename__ = "contexts"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_context_user_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)  # e.g. '#a855f7'
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="contexts")
    boards = relationship(
        "Board",
        back_populates="context",
        cascade="all, delete-orphan",
        order_by="Board.id",
    )
