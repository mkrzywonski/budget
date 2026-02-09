from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class BookSettings(Base):
    """Per-book settings, stored as a single row (id=1)."""

    __tablename__ = "book_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    password_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    password_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
