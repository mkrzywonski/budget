from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Account(Base, TimestampMixin):
    """
    Represents a financial account (checking, savings, credit card, etc.).
    Each account has its own ledger of transactions.
    """

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)  # checking, savings, credit_card, etc.
    institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Display order for UI
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="account", cascade="all, delete-orphan"
    )
    recurring_templates: Mapped[list["RecurringTemplate"]] = relationship(
        "RecurringTemplate", back_populates="account", cascade="all, delete-orphan"
    )
    import_profiles: Mapped[list["ImportProfile"]] = relationship(
        "ImportProfile", back_populates="account", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Account(id={self.id}, name='{self.name}', type='{self.account_type}')>"
