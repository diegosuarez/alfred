from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from app.database import Base
from app.core.time import utcnow

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    # Nullable: a user who logs in only via Google has no local password.
    hashed_password = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    boards = relationship("Board", back_populates="user", cascade="all, delete-orphan")
    contexts = relationship("Context", back_populates="user", cascade="all, delete-orphan")
    google_accounts = relationship(
        "GoogleAccount", back_populates="user", cascade="all, delete-orphan"
    )
