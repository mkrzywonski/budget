import enum
from sqlalchemy import String, Integer, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class RuleMatchType(enum.Enum):
    """How the rule matches transaction text."""
    CONTAINS = "contains"
    EXACT = "exact"
    REGEX = "regex"


class CategorizationRule(Base, TimestampMixin):
    """
    Rule for auto-categorizing transactions based on payee/description patterns.

    Rules are checked in order (by priority), first match wins.
    """

    __tablename__ = "categorization_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Pattern matching
    pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    match_type: Mapped[RuleMatchType] = mapped_column(
        Enum(RuleMatchType), nullable=False, default=RuleMatchType.CONTAINS
    )

    # What field to match against
    match_field: Mapped[str] = mapped_column(
        String(50), nullable=False, default="payee_raw"
    )  # payee_raw, payee_normalized, memo

    # What to assign
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )
    normalized_payee: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Rule ordering (lower = higher priority, checked first)
    priority: Mapped[int] = mapped_column(Integer, default=100)

    # Optional: limit rule to specific account
    account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("accounts.id"), nullable=True
    )

    # Description for UI
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    category: Mapped["Category | None"] = relationship("Category")
    account: Mapped["Account | None"] = relationship("Account")

    def __repr__(self) -> str:
        return (
            f"<CategorizationRule(id={self.id}, pattern='{self.pattern}', "
            f"match_type={self.match_type.value})>"
        )
