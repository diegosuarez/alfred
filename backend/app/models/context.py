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
    # Optional pointer to a Google account this context uses for
    # calendar/contacts integrations. SET NULL on delete so removing the
    # account merely detaches it instead of cascading the context away.
    google_account_id = Column(
        Integer,
        ForeignKey("google_accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="contexts")
    google_account = relationship("GoogleAccount")
    boards = relationship(
        "Board",
        back_populates="context",
        cascade="all, delete-orphan",
        order_by="Board.id",
    )
