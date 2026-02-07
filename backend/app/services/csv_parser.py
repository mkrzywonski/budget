"""
CSV parsing service with auto-detection and configurable mappings.

Supports:
- Auto-detection of date formats
- Multiple amount formats (single column, split debit/credit, parentheses negatives)
- Header signature matching for profile auto-selection
"""

import csv
import re
import hashlib
from datetime import datetime, date
from dataclasses import dataclass, field
from io import StringIO
from typing import Any


# Common date formats to try for auto-detection
DATE_FORMATS = [
    "%m/%d/%Y",      # 01/15/2024
    "%m-%d-%Y",      # 01-15-2024
    "%Y-%m-%d",      # 2024-01-15
    "%Y/%m/%d",      # 2024/01/15
    "%d/%m/%Y",      # 15/01/2024
    "%m/%d/%y",      # 01/15/24
    "%d-%m-%Y",      # 15-01-2024
    "%b %d, %Y",     # Jan 15, 2024
    "%B %d, %Y",     # January 15, 2024
    "%d %b %Y",      # 15 Jan 2024
]


@dataclass
class ParsedTransaction:
    """A transaction parsed from CSV."""
    row_index: int
    posted_date: date
    amount_cents: int
    payee_raw: str | None = None
    memo: str | None = None

    # For duplicate detection
    fingerprint: str = ""
    external_id: str | None = None  # e.g., FITID from QFX

    # Original row data for reference
    raw_data: dict = field(default_factory=dict)

    # Parsing issues
    warnings: list[str] = field(default_factory=list)


@dataclass
class CSVParseResult:
    """Result of parsing a CSV file."""
    headers: list[str]
    header_signature: str
    transactions: list[ParsedTransaction]
    detected_date_format: str | None = None
    row_count: int = 0
    error_count: int = 0
    errors: list[str] = field(default_factory=list)


class CSVParser:
    """
    Parser for CSV transaction files.
    """

    def __init__(
        self,
        column_mappings: dict[str, int] | None = None,
        amount_config: dict | None = None,
        date_format: str | None = None,
        delimiter: str = ",",
        skip_rows: int = 0,
        has_header: bool = True
    ):
        """
        Initialize parser with configuration.

        Args:
            column_mappings: Dict mapping field names to column indices
                             e.g., {"date": 0, "amount": 1, "payee": 2, "memo": 3}
            amount_config: Configuration for amount parsing
                           e.g., {"type": "single", "column": 1, "negate": False}
                           or {"type": "split", "debit_column": 2, "credit_column": 3}
            date_format: strptime format string, or None for auto-detect
            delimiter: CSV delimiter character
            skip_rows: Number of rows to skip before headers
            has_header: Whether the first row (after skip_rows) is a header row
        """
        self.column_mappings = column_mappings or {}
        self.amount_config = amount_config or {"type": "single", "column": 1}
        self.date_format = date_format
        self.delimiter = delimiter
        self.skip_rows = skip_rows
        self.has_header = has_header

        self._detected_date_format: str | None = None

    def parse(self, content: str) -> CSVParseResult:
        """
        Parse CSV content and return structured transactions.
        """
        lines = content.strip().split('\n')

        # Skip initial rows if configured
        if self.skip_rows > 0:
            lines = lines[self.skip_rows:]

        if not lines:
            return CSVParseResult(
                headers=[],
                header_signature="",
                transactions=[],
                errors=["Empty CSV file"]
            )

        reader = csv.reader(lines, delimiter=self.delimiter)
        rows = list(reader)

        if not rows:
            return CSVParseResult(
                headers=[],
                header_signature="",
                transactions=[],
                errors=["No data rows found"]
            )

        if self.has_header:
            headers = rows[0]
            data_rows = rows[1:]
        else:
            num_cols = len(rows[0])
            headers = [f"Column {i + 1}" for i in range(num_cols)]
            data_rows = rows
        header_signature = self._compute_header_signature(headers)

        transactions: list[ParsedTransaction] = []
        errors: list[str] = []

        for idx, row in enumerate(data_rows):
            try:
                tx = self._parse_row(idx + 1, row, headers)
                if tx:
                    transactions.append(tx)
            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")

        return CSVParseResult(
            headers=headers,
            header_signature=header_signature,
            transactions=transactions,
            detected_date_format=self._detected_date_format,
            row_count=len(data_rows),
            error_count=len(errors),
            errors=errors
        )

    def _compute_header_signature(self, headers: list[str]) -> str:
        """Compute a stable signature from headers for profile matching."""
        normalized = [h.strip().lower() for h in headers]
        signature_str = "|".join(normalized)
        return hashlib.md5(signature_str.encode()).hexdigest()[:16]

    def _parse_row(
        self,
        row_index: int,
        row: list[str],
        headers: list[str]
    ) -> ParsedTransaction | None:
        """Parse a single row into a transaction."""
        if not row or all(not cell.strip() for cell in row):
            return None  # Skip empty rows

        # Build raw data dict for reference
        raw_data = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}

        warnings: list[str] = []

        # Parse date
        date_col = self.column_mappings.get("date", 0)
        date_str = row[date_col].strip() if date_col < len(row) else ""
        posted_date = self._parse_date(date_str)
        if not posted_date:
            raise ValueError(f"Could not parse date: {date_str}")

        # Parse amount
        amount_cents = self._parse_amount(row)

        # Parse payee
        payee_col = self.column_mappings.get("payee")
        payee_raw = None
        if payee_col is not None and payee_col < len(row):
            payee_raw = row[payee_col].strip() or None

        # Parse memo
        memo_col = self.column_mappings.get("memo")
        memo = None
        if memo_col is not None and memo_col < len(row):
            memo = row[memo_col].strip() or None

        # Compute fingerprint for duplicate detection
        fingerprint = self._compute_fingerprint(posted_date, amount_cents, payee_raw)

        return ParsedTransaction(
            row_index=row_index,
            posted_date=posted_date,
            amount_cents=amount_cents,
            payee_raw=payee_raw,
            memo=memo,
            fingerprint=fingerprint,
            raw_data=raw_data,
            warnings=warnings
        )

    def _parse_date(self, date_str: str) -> date | None:
        """Parse a date string, using configured format or auto-detecting."""
        if not date_str:
            return None

        # Try configured format first
        if self.date_format:
            try:
                return datetime.strptime(date_str, self.date_format).date()
            except ValueError:
                pass

        # Try previously detected format
        if self._detected_date_format:
            try:
                return datetime.strptime(date_str, self._detected_date_format).date()
            except ValueError:
                pass

        # Auto-detect from common formats
        for fmt in DATE_FORMATS:
            try:
                result = datetime.strptime(date_str, fmt).date()
                self._detected_date_format = fmt
                return result
            except ValueError:
                continue

        return None

    def _parse_amount(self, row: list[str]) -> int:
        """Parse amount from row based on amount_config."""
        config = self.amount_config
        amount_type = config.get("type", "single")

        if amount_type == "split":
            # Separate debit and credit columns
            debit_col = config.get("debit_column", 0)
            credit_col = config.get("credit_column", 1)

            debit_str = row[debit_col].strip() if debit_col < len(row) else ""
            credit_str = row[credit_col].strip() if credit_col < len(row) else ""

            debit = self._parse_amount_string(debit_str) if debit_str else 0
            credit = self._parse_amount_string(credit_str) if credit_str else 0

            # Debits are negative, credits are positive
            return credit - debit
        else:
            # Single amount column
            amount_col = config.get("column", 1)
            amount_str = row[amount_col].strip() if amount_col < len(row) else "0"
            amount = self._parse_amount_string(amount_str)

            # Apply sign convention
            if config.get("negate", False):
                amount = -amount

            return amount

    def _parse_amount_string(self, amount_str: str) -> int:
        """
        Parse an amount string to cents.

        Handles:
        - Currency symbols ($, €, etc.)
        - Parentheses for negatives: (100.00)
        - Commas as thousand separators
        - Negative signs
        """
        if not amount_str:
            return 0

        original = amount_str

        # Check for parentheses (negative)
        is_negative = False
        if amount_str.startswith("(") and amount_str.endswith(")"):
            is_negative = True
            amount_str = amount_str[1:-1]

        # Remove currency symbols and whitespace
        amount_str = re.sub(r'[^\d.,\-]', '', amount_str)

        # Handle negative sign
        if amount_str.startswith("-"):
            is_negative = True
            amount_str = amount_str[1:]

        # Remove thousand separators (commas)
        amount_str = amount_str.replace(",", "")

        # Parse as float then convert to cents
        try:
            amount = float(amount_str)
            cents = int(round(amount * 100))
            return -cents if is_negative else cents
        except ValueError:
            raise ValueError(f"Could not parse amount: {original}")

    def _compute_fingerprint(
        self,
        posted_date: date,
        amount_cents: int,
        payee: str | None
    ) -> str:
        """Compute fingerprint for duplicate detection."""
        # Normalize payee for matching
        payee_normalized = (payee or "").lower().strip()

        parts = [
            posted_date.isoformat(),
            str(amount_cents),
            payee_normalized
        ]
        fingerprint_str = "|".join(parts)
        return hashlib.md5(fingerprint_str.encode()).hexdigest()


def parse_csv_file(
    content: str,
    column_mappings: dict[str, int] | None = None,
    amount_config: dict | None = None,
    date_format: str | None = None,
    delimiter: str = ",",
    skip_rows: int = 0,
    has_header: bool = True
) -> CSVParseResult:
    """
    Convenience function to parse a CSV file.
    """
    parser = CSVParser(
        column_mappings=column_mappings,
        amount_config=amount_config,
        date_format=date_format,
        delimiter=delimiter,
        skip_rows=skip_rows,
        has_header=has_header
    )
    return parser.parse(content)


def detect_columns(headers: list[str]) -> dict[str, int]:
    """
    Auto-detect column mappings from headers.

    Returns best-guess mappings for date, amount, payee, memo.
    """
    mappings: dict[str, int] = {}
    headers_lower = [h.lower().strip() for h in headers]

    # Date column detection
    date_patterns = ["date", "posted", "transaction date", "trans date", "post date"]
    for i, h in enumerate(headers_lower):
        if any(p in h for p in date_patterns):
            mappings["date"] = i
            break

    # Amount column detection
    amount_patterns = ["amount", "sum", "value", "total"]
    for i, h in enumerate(headers_lower):
        if any(p in h for p in amount_patterns) and "balance" not in h:
            mappings["amount"] = i
            break

    # Check for split debit/credit
    debit_col = None
    credit_col = None
    for i, h in enumerate(headers_lower):
        if "debit" in h or "withdrawal" in h or "payment" in h:
            debit_col = i
        if "credit" in h or "deposit" in h:
            credit_col = i

    # Payee column detection
    payee_patterns = ["payee", "description", "merchant", "name", "vendor", "memo"]
    for i, h in enumerate(headers_lower):
        if any(p in h for p in payee_patterns):
            mappings["payee"] = i
            break

    # Memo column (if different from payee)
    memo_patterns = ["memo", "note", "reference", "check"]
    for i, h in enumerate(headers_lower):
        if any(p in h for p in memo_patterns) and i != mappings.get("payee"):
            mappings["memo"] = i
            break

    return mappings, debit_col, credit_col
