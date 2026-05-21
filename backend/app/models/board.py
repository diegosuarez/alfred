from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.core.time import utcnow

class Board(Base):
    __tablename__ = "boards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    # Single grapheme emoji used as the board's sidebar icon. NULL means
    # "use the default folder fallback in the UI".
    icon = Column(String(16), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Nullable at the SQL level so existing rows on a legacy DB don't break;
    # application code always assigns one (lifespan migration backfills).
    context_id = Column(Integer, ForeignKey("contexts.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="boards")
    context = relationship("Context", back_populates="boards")
    columns = relationship("Column", back_populates="board", cascade="all, delete-orphan", order_by="Column.position")
    tasks = relationship("Task", back_populates="board", cascade="all, delete-orphan")
