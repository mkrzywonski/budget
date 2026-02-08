from sqlalchemy import String, Integer, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Budget(Base, TimestampMixin):
    """A named budget with per-category targets, scoped to specific accounts."""

    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    items: Mapped[list["BudgetItem"]] = relationship(
        "BudgetItem", back_populates="budget", cascade="all, delete-orphan"
    )
    accounts: Mapped[list["BudgetAccount"]] = relationship(
        "BudgetAccount", back_populates="budget", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Budget(id={self.id}, name='{self.name}')>"


class BudgetItem(Base, TimestampMixin):
    """A single category target within a budget."""

    __tablename__ = "budget_items"
    __table_args__ = (
        UniqueConstraint("budget_id", "category_id", name="uq_budget_category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    budget_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=False
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    budget: Mapped["Budget"] = relationship("Budget", back_populates="items")
    category: Mapped["Category"] = relationship("Category")

    def __repr__(self) -> str:
        return f"<BudgetItem(budget={self.budget_id}, category={self.category_id}, amount={self.amount_cents})>"


class BudgetAccount(Base):
    """Join table linking budgets to accounts for actuals scoping."""

    __tablename__ = "budget_accounts"
    __table_args__ = (
        UniqueConstraint("budget_id", "account_id", name="uq_budget_account"),
    )

    budget_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("budgets.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id"), primary_key=True
    )

    # Relationships
    budget: Mapped["Budget"] = relationship("Budget", back_populates="accounts")
