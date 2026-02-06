from sqlalchemy import String, Integer, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Payee(Base, TimestampMixin):
    """
    A named payee with pattern-matching rules.

    When a transaction is created or imported, its payee_raw is checked against
    all payee match_patterns. If a match is found, the transaction's display_name
    is set to this payee's name and category_id is set to default_category_id.

    match_patterns is a JSON array of objects:
        [{"type": "starts_with", "pattern": "PWP*INSTITUTE FOR"}, ...]

    Supported match types: starts_with, contains, exact, regex
    """

    __tablename__ = "payees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    match_patterns: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    default_category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )

    # Relationships
    default_category: Mapped["Category | None"] = relationship("Category")

    def __repr__(self) -> str:
        return f"<Payee(id={self.id}, name='{self.name}')>"
