from sqlalchemy import String, Integer, ForeignKey, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class ImportProfile(Base, TimestampMixin):
    """
    Saved import configuration for CSV files.

    Matched by header signature - stores the expected headers and column mappings.
    """

    __tablename__ = "import_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Which account this profile is for
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id"), nullable=False
    )

    # Profile identification
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Header signature for auto-matching (stored as JSON array of header names)
    header_signature: Mapped[list] = mapped_column(JSON, nullable=False)

    # Column mappings (JSON object: {"date": 0, "amount": 2, "payee": 1, ...})
    column_mappings: Mapped[dict] = mapped_column(JSON, nullable=False)

    # Amount parsing options
    amount_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Example: {
    #   "type": "single" | "split",
    #   "amount_column": 2,
    #   "debit_column": 3,
    #   "credit_column": 4,
    #   "negate": false,
    #   "strip_currency": true,
    #   "parens_negative": true
    # }

    # Date parsing
    date_format: Mapped[str | None] = mapped_column(String(50), nullable=True)  # null = auto-detect

    # CSV parsing options
    delimiter: Mapped[str] = mapped_column(String(5), default=",")
    has_header: Mapped[bool] = mapped_column(Boolean, default=True)
    skip_rows: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="import_profiles")

    def __repr__(self) -> str:
        return f"<ImportProfile(id={self.id}, name='{self.name}', account_id={self.account_id})>"
