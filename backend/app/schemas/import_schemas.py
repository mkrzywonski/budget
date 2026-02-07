from datetime import date
from pydantic import BaseModel


class ColumnMappings(BaseModel):
    """Column index mappings for CSV parsing."""
    date: int = 0
    amount: int | None = None
    payee: int | None = None
    memo: int | None = None


class AmountConfig(BaseModel):
    """Configuration for parsing amounts."""
    type: str = "single"  # "single" or "split"
    column: int | None = None  # For single type
    debit_column: int | None = None  # For split type
    credit_column: int | None = None  # For split type
    negate: bool = False


class CSVUploadRequest(BaseModel):
    """Request to parse a CSV file."""
    content: str
    account_id: int
    delimiter: str = ","
    skip_rows: int = 0
    has_header: bool = True
    # Optional: override auto-detection
    column_mappings: ColumnMappings | None = None
    amount_config: AmountConfig | None = None
    date_format: str | None = None


class ParsedTransactionResponse(BaseModel):
    """A parsed transaction from CSV."""
    row_index: int
    posted_date: date
    amount_cents: int
    amount: float
    payee_raw: str | None
    memo: str | None
    fingerprint: str
    external_id: str | None = None
    raw_data: dict
    warnings: list[str]

    @classmethod
    def from_parsed(cls, tx):
        return cls(
            row_index=tx.row_index,
            posted_date=tx.posted_date,
            amount_cents=tx.amount_cents,
            amount=tx.amount_cents / 100.0,
            payee_raw=tx.payee_raw,
            memo=tx.memo,
            fingerprint=tx.fingerprint,
            external_id=tx.external_id,
            raw_data=tx.raw_data,
            warnings=tx.warnings
        )


class ExistingTransactionInfo(BaseModel):
    """Info about an existing transaction (for duplicate display)."""
    id: int
    posted_date: date
    amount_cents: int
    payee_raw: str | None
    memo: str | None


class DuplicateResponse(BaseModel):
    """A potential duplicate transaction."""
    parsed: ParsedTransactionResponse
    existing: ExistingTransactionInfo
    fingerprint: str


class CSVPreviewResponse(BaseModel):
    """Response from CSV preview."""
    headers: list[str]
    header_signature: str
    detected_date_format: str | None
    detected_mappings: ColumnMappings | None
    batch_id: str
    new_transactions: list[ParsedTransactionResponse]
    duplicates: list[DuplicateResponse]
    total_count: int
    new_count: int
    duplicate_count: int
    error_count: int
    errors: list[str]
    # Profile info
    matched_profile_id: int | None = None
    matched_profile_name: str | None = None


class OFXUploadRequest(BaseModel):
    """Request to parse an OFX/QFX file."""
    content: str
    account_id: int


class ImportCommitRequest(BaseModel):
    """Request to commit an import."""
    account_id: int
    batch_id: str
    transactions: list[ParsedTransactionResponse]
    accepted_duplicate_indices: list[int] = []
    source: str = "import_csv"


class ImportCommitResponse(BaseModel):
    """Response from committing an import."""
    batch_id: str
    imported_count: int
    skipped_count: int
    transaction_ids: list[int]


class ImportProfileResponse(BaseModel):
    """Import profile response."""
    id: int
    account_id: int
    name: str
    header_signature: list[str]
    column_mappings: dict
    amount_config: dict
    date_format: str | None
    delimiter: str
    skip_rows: int
    has_header: bool

    class Config:
        from_attributes = True


class CreateProfileRequest(BaseModel):
    """Request to create/update the import profile for an account."""
    account_id: int
    name: str = "Import Settings"
    headers: list[str]
    column_mappings: ColumnMappings
    amount_config: AmountConfig
    date_format: str | None = None
    delimiter: str = ","
    skip_rows: int = 0
    has_header: bool = True
