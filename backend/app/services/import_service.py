"""
Import service for managing transaction imports.

Handles:
- Duplicate detection against existing transactions
- Batch import with atomic commits
- Import profile matching and management
"""

import uuid
from datetime import datetime
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract

from ..models import Transaction, ImportProfile, TransactionSource, TransactionType
from .csv_parser import ParsedTransaction, CSVParseResult
from .payee_matcher import apply_payee_match


@dataclass
class DuplicateInfo:
    """Information about a potential duplicate."""
    parsed_tx: ParsedTransaction
    existing_tx: Transaction
    fingerprint: str


@dataclass
class ImportPreview:
    """Preview of an import batch before committing."""
    account_id: int
    batch_id: str
    new_transactions: list[ParsedTransaction]
    duplicates: list[DuplicateInfo]
    total_count: int
    new_count: int
    duplicate_count: int
    error_count: int
    errors: list[str]


@dataclass
class ImportResult:
    """Result of committing an import."""
    batch_id: str
    imported_count: int
    skipped_count: int
    transaction_ids: list[int]


class ImportService:
    """Service for importing transactions."""

    def __init__(self, db: Session):
        self.db = db

    def preview_import(
        self,
        account_id: int,
        parse_result: CSVParseResult
    ) -> ImportPreview:
        """
        Generate a preview of what would be imported.

        Identifies duplicates by checking fingerprints against existing transactions.
        """
        batch_id = str(uuid.uuid4())[:8]

        new_transactions: list[ParsedTransaction] = []
        duplicates: list[DuplicateInfo] = []

        # Get fingerprints of existing transactions in this account
        existing_fingerprints = self._get_existing_fingerprints(account_id)

        # Also build a map of external_ids for FITID-based dedup (QFX imports)
        existing_external_ids = self._get_existing_external_ids(account_id)

        for tx in parse_result.transactions:
            # Check external_id first (more reliable for QFX re-imports)
            if tx.external_id and tx.external_id in existing_external_ids:
                existing = existing_external_ids[tx.external_id]
                duplicates.append(DuplicateInfo(
                    parsed_tx=tx,
                    existing_tx=existing,
                    fingerprint=tx.fingerprint
                ))
            elif tx.fingerprint in existing_fingerprints:
                # Fall back to fingerprint-based dedup (CSV imports)
                existing = existing_fingerprints[tx.fingerprint]
                duplicates.append(DuplicateInfo(
                    parsed_tx=tx,
                    existing_tx=existing,
                    fingerprint=tx.fingerprint
                ))
            else:
                new_transactions.append(tx)

        return ImportPreview(
            account_id=account_id,
            batch_id=batch_id,
            new_transactions=new_transactions,
            duplicates=duplicates,
            total_count=len(parse_result.transactions),
            new_count=len(new_transactions),
            duplicate_count=len(duplicates),
            error_count=parse_result.error_count,
            errors=parse_result.errors
        )

    def _get_existing_fingerprints(self, account_id: int) -> dict[str, Transaction]:
        """Get fingerprints of all transactions in the account."""
        transactions = self.db.query(Transaction).filter(
            Transaction.account_id == account_id
        ).all()

        fingerprints: dict[str, Transaction] = {}
        for tx in transactions:
            fp = self._compute_fingerprint(tx)
            fingerprints[fp] = tx

        return fingerprints

    def _get_existing_external_ids(self, account_id: int) -> dict[str, Transaction]:
        """Get external_ids (e.g. FITIDs) of all transactions in the account."""
        transactions = self.db.query(Transaction).filter(
            Transaction.account_id == account_id,
            Transaction.external_id.isnot(None)
        ).all()

        return {tx.external_id: tx for tx in transactions}

    def _compute_fingerprint(self, tx: Transaction) -> str:
        """Compute fingerprint for an existing transaction."""
        import hashlib
        payee = (tx.payee_raw or "").lower().strip()
        parts = [
            tx.posted_date.isoformat(),
            str(tx.amount_cents),
            payee
        ]
        return hashlib.md5("|".join(parts).encode()).hexdigest()

    def commit_import(
        self,
        account_id: int,
        batch_id: str,
        transactions: list[ParsedTransaction],
        accepted_duplicate_indices: list[int] | None = None,
        source: TransactionSource = TransactionSource.IMPORT_CSV
    ) -> ImportResult:
        """
        Commit an import batch to the database.

        Args:
            account_id: Account to import into
            batch_id: Unique identifier for this import batch
            transactions: List of parsed transactions to import
            accepted_duplicate_indices: Row indices of duplicates to import anyway
            source: Source of the import (CSV or QFX)
        """
        accepted_dupes = set(accepted_duplicate_indices or [])
        imported_ids: list[int] = []
        skipped = 0

        for tx in transactions:
            # Check if this was a duplicate that wasn't accepted
            if tx.fingerprint and tx.row_index not in accepted_dupes:
                # Check if it's actually a duplicate (exclude current batch to avoid
                # false positives from same-batch transactions with same date+amount)
                existing = self._find_duplicate(account_id, tx, exclude_batch_id=batch_id)
                if existing and tx.row_index not in accepted_dupes:
                    skipped += 1
                    continue

            # Create the transaction
            db_tx = Transaction(
                account_id=account_id,
                posted_date=tx.posted_date,
                amount_cents=tx.amount_cents,
                payee_raw=tx.payee_raw,
                memo=tx.memo,
                transaction_type=TransactionType.ACTUAL,
                source=source,
                import_batch_id=batch_id,
                external_id=tx.external_id
            )
            self.db.add(db_tx)
            self.db.flush()
            apply_payee_match(self.db, db_tx)
            self.db.flush()
            imported_ids.append(db_tx.id)

        return ImportResult(
            batch_id=batch_id,
            imported_count=len(imported_ids),
            skipped_count=skipped,
            transaction_ids=imported_ids
        )

    def _find_duplicate(self, account_id: int, tx: ParsedTransaction, exclude_batch_id: str | None = None) -> Transaction | None:
        """Find an existing transaction matching this parsed transaction."""
        # Prefer external_id match (FITID) — more reliable than date+amount
        if tx.external_id:
            match = self.db.query(Transaction).filter(
                Transaction.account_id == account_id,
                Transaction.external_id == tx.external_id
            ).first()
            if match:
                return match

        # Fall back to date+amount match
        query = self.db.query(Transaction).filter(
            and_(
                Transaction.account_id == account_id,
                Transaction.posted_date == tx.posted_date,
                Transaction.amount_cents == tx.amount_cents
            )
        )
        if exclude_batch_id:
            query = query.filter(Transaction.import_batch_id != exclude_batch_id)
        return query.first()

    def find_matching_profile(
        self,
        account_id: int,
        header_signature: str
    ) -> ImportProfile | None:
        """Find an import profile matching the header signature."""
        return self.db.query(ImportProfile).filter(
            and_(
                ImportProfile.account_id == account_id,
                ImportProfile.header_signature.contains(header_signature)
            )
        ).first()

    def upsert_profile(
        self,
        account_id: int,
        name: str,
        headers: list[str],
        header_signature: str,
        column_mappings: dict[str, int],
        amount_config: dict,
        date_format: str | None = None,
        delimiter: str = ",",
        skip_rows: int = 0,
        has_header: bool = True
    ) -> ImportProfile:
        """Create or update the import profile for an account (one per account)."""
        profile = self.db.query(ImportProfile).filter(
            ImportProfile.account_id == account_id
        ).first()

        if profile:
            profile.name = name
            profile.header_signature = headers
            profile.column_mappings = column_mappings
            profile.amount_config = amount_config
            profile.date_format = date_format
            profile.delimiter = delimiter
            profile.skip_rows = skip_rows
            profile.has_header = has_header
        else:
            profile = ImportProfile(
                account_id=account_id,
                name=name,
                header_signature=headers,
                column_mappings=column_mappings,
                amount_config=amount_config,
                date_format=date_format,
                delimiter=delimiter,
                skip_rows=skip_rows,
                has_header=has_header
            )
            self.db.add(profile)

        self.db.flush()
        self.db.refresh(profile)
        return profile

    def get_profiles(self, account_id: int) -> list[ImportProfile]:
        """Get all import profiles for an account."""
        return self.db.query(ImportProfile).filter(
            ImportProfile.account_id == account_id
        ).all()
