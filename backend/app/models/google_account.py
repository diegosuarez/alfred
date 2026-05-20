from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base
from app.core.time import utcnow


class GoogleAccount(Base):
    """A Google identity the user has connected. Multiple accounts per user
    are allowed (e.g. personal vs. work). A Context may later opt into using
    one of these accounts for Calendar/Contacts integrations.
    """

    __tablename__ = "google_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "google_user_id", name="uq_google_account_user_sub"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    google_user_id = Column(String, nullable=False, index=True)  # the "sub" claim
    email = Column(String, nullable=False)
    access_token = Column(String, nullable=True)
    refresh_token = Column(String, nullable=True)
    # Space-separated list of OAuth scopes the user has granted.
    scopes = Column(String, nullable=False, default="")
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="google_accounts")
