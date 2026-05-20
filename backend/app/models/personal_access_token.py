from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


class PersonalAccessToken(Base):
    """A long-lived bearer credential the user can mint for CLI clients or
    AI assistants. The plaintext token leaves the server exactly once
    (in the create response); subsequent requests carry it back via
    Authorization: Bearer <token>.

    We store a SHA-256 of the full token (high-entropy random, so a
    digest is plenty — no need for bcrypt) plus a short non-secret
    prefix to make lookups O(1).
    """

    __tablename__ = "personal_access_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # human label like "macbook cli"
    prefix = Column(String, nullable=False, unique=True, index=True)
    token_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="personal_access_tokens")
