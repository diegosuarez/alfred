from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
)
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.database import Base


class Passkey(Base):
    """A WebAuthn credential bound to a user. We store the COSE public
    key + the credential id (raw bytes) so we can verify assertions, and
    the signature counter to detect replays."""

    __tablename__ = "passkeys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The credential_id is a raw binary blob; we index it for the lookup
    # during assertion (it's effectively unique on its own).
    credential_id = Column(LargeBinary, nullable=False, unique=True, index=True)
    public_key = Column(LargeBinary, nullable=False)
    sign_count = Column(Integer, nullable=False, default=0)
    # Human-friendly label so the user can tell "MacBook Touch ID" apart
    # from "Pixel fingerprint" in the management UI.
    label = Column(String, nullable=True)
    # Comma-separated list (e.g. "usb,internal,hybrid") echoed back at
    # the browser on subsequent auth attempts.
    transports = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User")
