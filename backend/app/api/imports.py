from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Account, TransactionSource
from ..services.csv_parser import CSVParser, detect_columns, ParsedTransaction
from ..services.import_service import ImportService
from ..schemas.import_schemas import (
    CSVUploadRequest,
    CSVPreviewResponse,
    ParsedTransactionResponse,
    DuplicateResponse,
    ExistingTransactionInfo,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportProfileResponse,
    CreateProfileRequest,
    ColumnMappings,
)

router = APIRouter()


@router.post("/csv/preview", response_model=CSVPreviewResponse)
def preview_csv_import(
    request: CSVUploadRequest,
    db: Session = Depends(get_db)
):
    """
    Parse a CSV file and preview the import.

    Returns detected mappings, parsed transactions, and potential duplicates.
    """
    # Verify account exists
    account = db.query(Account).filter(Account.id == request.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    import_service = ImportService(db)

    # Build parser configuration
    column_mappings = None
    amount_config = None

    if request.column_mappings:
        column_mappings = {
            "date": request.column_mappings.date,
        }
        if request.column_mappings.payee is not None:
            column_mappings["payee"] = request.column_mappings.payee
        if request.column_mappings.memo is not None:
            column_mappings["memo"] = request.column_mappings.memo

    if request.amount_config:
        amount_config = request.amount_config.model_dump()
    else:
        # Default single column config
        amount_config = {"type": "single", "column": 1}

    # Parse CSV
    parser = CSVParser(
        column_mappings=column_mappings,
        amount_config=amount_config,
        date_format=request.date_format,
        delimiter=request.delimiter,
        skip_rows=request.skip_rows
    )

    # First pass: just get headers
    lines = request.content.strip().split('\n')
    if request.skip_rows > 0:
        lines = lines[request.skip_rows:]

    if not lines:
        raise HTTPException(status_code=400, detail="Empty CSV file")

    import csv
    headers = next(csv.reader([lines[0]], delimiter=request.delimiter))
    header_signature = parser._compute_header_signature(headers)

    # Check for matching profile
    matched_profile = import_service.find_matching_profile(
        request.account_id, header_signature
    )

    # If we have a profile and no explicit mappings, use profile settings
    detected_mappings = None
    if matched_profile and not request.column_mappings:
        column_mappings = matched_profile.column_mappings
        amount_config = matched_profile.amount_config
        parser = CSVParser(
            column_mappings=column_mappings,
            amount_config=amount_config,
            date_format=matched_profile.date_format,
            delimiter=matched_profile.delimiter,
            skip_rows=matched_profile.skip_rows
        )
    elif not request.column_mappings:
        # Auto-detect columns
        detected, debit_col, credit_col = detect_columns(headers)
        column_mappings = detected

        if debit_col is not None and credit_col is not None:
            amount_config = {
                "type": "split",
                "debit_column": debit_col,
                "credit_column": credit_col
            }
        elif "amount" in detected:
            amount_config = {"type": "single", "column": detected["amount"]}

        detected_mappings = ColumnMappings(
            date=detected.get("date", 0),
            amount=detected.get("amount"),
            payee=detected.get("payee"),
            memo=detected.get("memo")
        )

        parser = CSVParser(
            column_mappings=column_mappings,
            amount_config=amount_config,
            date_format=request.date_format,
            delimiter=request.delimiter,
            skip_rows=request.skip_rows
        )

    # Parse the full file
    parse_result = parser.parse(request.content)

    # Generate import preview with duplicate detection
    preview = import_service.preview_import(request.account_id, parse_result)

    # Build response
    new_txs = [ParsedTransactionResponse.from_parsed(tx) for tx in preview.new_transactions]

    duplicates = []
    for dup in preview.duplicates:
        duplicates.append(DuplicateResponse(
            parsed=ParsedTransactionResponse.from_parsed(dup.parsed_tx),
            existing=ExistingTransactionInfo(
                id=dup.existing_tx.id,
                posted_date=dup.existing_tx.posted_date,
                amount_cents=dup.existing_tx.amount_cents,
                payee_raw=dup.existing_tx.payee_raw,
                memo=dup.existing_tx.memo
            ),
            fingerprint=dup.fingerprint
        ))

    return CSVPreviewResponse(
        headers=parse_result.headers,
        header_signature=header_signature,
        detected_date_format=parse_result.detected_date_format,
        detected_mappings=detected_mappings,
        batch_id=preview.batch_id,
        new_transactions=new_txs,
        duplicates=duplicates,
        total_count=preview.total_count,
        new_count=preview.new_count,
        duplicate_count=preview.duplicate_count,
        error_count=preview.error_count,
        errors=preview.errors,
        matched_profile_id=matched_profile.id if matched_profile else None,
        matched_profile_name=matched_profile.name if matched_profile else None
    )


@router.post("/commit", response_model=ImportCommitResponse)
def commit_import(
    request: ImportCommitRequest,
    db: Session = Depends(get_db)
):
    """
    Commit a previewed import batch.
    """
    account = db.query(Account).filter(Account.id == request.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    import_service = ImportService(db)

    # Convert response objects back to ParsedTransaction for import
    transactions = []
    for tx in request.transactions:
        transactions.append(ParsedTransaction(
            row_index=tx.row_index,
            posted_date=tx.posted_date,
            amount_cents=tx.amount_cents,
            payee_raw=tx.payee_raw,
            memo=tx.memo,
            fingerprint=tx.fingerprint,
            raw_data=tx.raw_data,
            warnings=tx.warnings
        ))

    result = import_service.commit_import(
        account_id=request.account_id,
        batch_id=request.batch_id,
        transactions=transactions,
        accepted_duplicate_indices=request.accepted_duplicate_indices,
        source=TransactionSource.IMPORT_CSV
    )

    return ImportCommitResponse(
        batch_id=result.batch_id,
        imported_count=result.imported_count,
        skipped_count=result.skipped_count,
        transaction_ids=result.transaction_ids
    )


@router.get("/profiles/{account_id}", response_model=list[ImportProfileResponse])
def get_import_profiles(
    account_id: int,
    db: Session = Depends(get_db)
):
    """Get all import profiles for an account."""
    import_service = ImportService(db)
    profiles = import_service.get_profiles(account_id)
    return profiles


@router.post("/profiles", response_model=ImportProfileResponse)
def create_import_profile(
    request: CreateProfileRequest,
    db: Session = Depends(get_db)
):
    """Create a new import profile."""
    account = db.query(Account).filter(Account.id == request.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    import_service = ImportService(db)

    # Compute header signature
    parser = CSVParser()
    header_signature = parser._compute_header_signature(request.headers)

    # Convert column mappings to dict
    column_mappings = {
        "date": request.column_mappings.date,
    }
    if request.column_mappings.payee is not None:
        column_mappings["payee"] = request.column_mappings.payee
    if request.column_mappings.memo is not None:
        column_mappings["memo"] = request.column_mappings.memo

    profile = import_service.create_profile(
        account_id=request.account_id,
        name=request.name,
        headers=request.headers,
        header_signature=header_signature,
        column_mappings=column_mappings,
        amount_config=request.amount_config.model_dump(),
        date_format=request.date_format,
        delimiter=request.delimiter,
        skip_rows=request.skip_rows
    )

    return profile
