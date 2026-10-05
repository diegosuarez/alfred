from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.core.time import utcnow
from app.database import Base


class UserSession(Base):
    """A "remember me" login on one device.

    The device holds an opaque refresh token in an HttpOnly cookie; we
    store only its SHA-256. The session slides: every refresh pushes
    `expires_at` forward, so a device that keeps using the app never
    has to log in again. Revocation is a soft delete (`revoked_at`).
    """

    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash = Column(String, nullable=False, unique=True, index=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    last_used_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
