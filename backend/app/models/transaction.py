import enum
from datetime import date
from sqlalchemy import String, Integer, Date, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class TransactionType(enum.Enum):
    """Type of transaction."""
    ACTUAL = "actual"
    FORECAST = "forecast"
    BALANCE_ADJUSTMENT = "balance_adjustment"
    TRANSFER = "transfer"


class TransactionSource(enum.Enum):
    """How the transaction was created."""
    MANUAL = "manual"
    IMPORT_CSV = "import_csv"
    IMPORT_QFX = "import_qfx"
    SYSTEM = "system"  # For balance adjustments, auto-generated entries


class Transaction(Base, TimestampMixin):
    """
    A financial transaction in an account's ledger.

    Amounts are stored as integer cents to avoid floating point issues.
    Negative amounts = outflow (expense), Positive amounts = inflow (income/refund).
    """

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Core fields
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id"), nullable=False, index=True
    )
    posted_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)  # Stored as cents

    # Payee information
    payee_raw: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payee_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Additional details
    memo: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Category
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )

    # Transaction metadata
    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType), nullable=False, default=TransactionType.ACTUAL
    )
    source: Mapped[TransactionSource] = mapped_column(
        Enum(TransactionSource), nullable=False, default=TransactionSource.MANUAL
    )

    # Import tracking
    import_batch_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g., FITID from QFX

    # Transfer linking - if this is a transfer, link to the other side
    transfer_link_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("transactions.id"), nullable=True
    )

    # Forecast fulfillment - link from forecast to actual that fulfilled it
    # When a forecast is converted to actual, we keep the template reference
    recurring_template_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("recurring_templates.id"), nullable=True
    )

    # Cleared/reconciled status
    is_cleared: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="transactions")
    category: Mapped["Category | None"] = relationship(
        "Category", back_populates="transactions"
    )
    transfer_link: Mapped["Transaction | None"] = relationship(
        "Transaction", remote_side="Transaction.id", uselist=False
    )
    recurring_template: Mapped["RecurringTemplate | None"] = relationship(
        "RecurringTemplate", back_populates="transactions"
    )

    @property
    def amount(self) -> float:
        """Get amount as decimal dollars."""
        return self.amount_cents / 100.0

    @amount.setter
    def amount(self, value: float) -> None:
        """Set amount from decimal dollars."""
        self.amount_cents = int(round(value * 100))

    def __repr__(self) -> str:
        return (
            f"<Transaction(id={self.id}, date={self.posted_date}, "
            f"amount=${self.amount:.2f}, payee='{self.payee_normalized or self.payee_raw}')>"
        )
