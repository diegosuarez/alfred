from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


class FCMSubscription(Base):
    """A Firebase Cloud Messaging registration owned by a user. The
    Android client posts its token here on every cold start; the
    reminder dispatcher iterates these rows alongside Web Push
    subscriptions to fan-out a notification to every device."""

    __tablename__ = "fcm_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Unique so re-subscribes from the same device upsert in place.
    token = Column(String, nullable=False, unique=True, index=True)
    # Free-form label from the client (e.g. "Pixel 7"). Optional.
    device_label = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User")
