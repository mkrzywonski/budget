import enum
from datetime import date
from sqlalchemy import String, Integer, Date, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class AmountMethod(enum.Enum):
    """How to calculate the forecast amount."""
    FIXED = "fixed"
    COPY_LAST = "copy_last"
    AVERAGE = "average"


class Frequency(enum.Enum):
    """How often the recurring transaction occurs."""
    MONTHLY = "monthly"
    EVERY_N_MONTHS = "every_n_months"
    ANNUAL = "annual"


class RecurringTemplate(Base, TimestampMixin):
    """
    Template for recurring/forecast transactions.

    Generates forecast rows for current and future months.
    Day-of-month overflow: if day=31 and month has fewer days, uses last day of month.
    """

    __tablename__ = "recurring_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Which account this recurring belongs to
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id"), nullable=False
    )

    # Description
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    payee: Mapped[str | None] = mapped_column(String(255), nullable=True)
    memo: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Category assignment
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )

    # Amount calculation
    amount_method: Mapped[AmountMethod] = mapped_column(
        Enum(AmountMethod), nullable=False, default=AmountMethod.FIXED
    )
    fixed_amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_count: Mapped[int] = mapped_column(Integer, default=3)  # For AVERAGE method

    # Frequency
    frequency: Mapped[Frequency] = mapped_column(
        Enum(Frequency), nullable=False, default=Frequency.MONTHLY
    )
    frequency_n: Mapped[int] = mapped_column(Integer, default=1)  # For EVERY_N_MONTHS
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)  # 1-31

    # Date range
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # null = no end

    # Active flag
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    account: Mapped["Account"] = relationship(
        "Account", back_populates="recurring_templates"
    )
    category: Mapped["Category | None"] = relationship("Category")
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="recurring_template"
    )

    @property
    def fixed_amount(self) -> float | None:
        """Get fixed amount as decimal dollars."""
        if self.fixed_amount_cents is None:
            return None
        return self.fixed_amount_cents / 100.0

    @fixed_amount.setter
    def fixed_amount(self, value: float | None) -> None:
        """Set fixed amount from decimal dollars."""
        if value is None:
            self.fixed_amount_cents = None
        else:
            self.fixed_amount_cents = int(round(value * 100))

    def __repr__(self) -> str:
        return (
            f"<RecurringTemplate(id={self.id}, name='{self.name}', "
            f"frequency={self.frequency.value})>"
        )
