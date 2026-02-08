from datetime import date
from sqlalchemy import Integer, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class ForecastDismissal(Base, TimestampMixin):
    """
    Tracks dismissed forecast instances.

    Each record dismisses a specific forecast for a payee+account+month combo.
    period_date is the first of the month (e.g. 2026-02-01).
    """

    __tablename__ = "forecast_dismissals"
    __table_args__ = (
        UniqueConstraint("payee_id", "account_id", "period_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    payee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("payees.id"), nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id"), nullable=False
    )
    period_date: Mapped[date] = mapped_column(Date, nullable=False)
