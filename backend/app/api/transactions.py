from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract, func, or_

from ..database import get_db
from ..models import Transaction, Account, TransactionType
from ..schemas import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    ConvertToTransferRequest,
    TransferMatchResponse,
)
from ..services.payee_matcher import apply_payee_match

router = APIRouter()


@router.get("/", response_model=list[TransactionResponse])
def list_transactions(
    account_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: list[int] | None = Query(None),
    uncategorized: bool = Query(False),
    payee_name: str | None = Query(None),
    amount_sign: str | None = Query(None),
    payee_search: str | None = Query(None),
    include_transfers: bool | None = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get transactions with optional filters.

    If year/month provided, returns transactions for that month.
    start_date/end_date, category_id, and payee_name support drill-down from reports.
    """
    query = db.query(Transaction)

    if account_id:
        query = query.filter(Transaction.account_id == account_id)

    if year and month:
        query = query.filter(
            and_(
                extract("year", Transaction.posted_date) == year,
                extract("month", Transaction.posted_date) == month
            )
        )

    if start_date:
        query = query.filter(Transaction.posted_date >= start_date)
    if end_date:
        query = query.filter(Transaction.posted_date <= end_date)
    if uncategorized:
        query = query.filter(Transaction.category_id.is_(None))
    elif category_id:
        query = query.filter(Transaction.category_id.in_(category_id))
    if payee_name:
        payee_label = func.coalesce(
            Transaction.display_name,
            Transaction.payee_normalized,
            Transaction.payee_raw,
        )
        query = query.filter(payee_label == payee_name)
    if payee_search:
        pattern = f"%{payee_search}%"
        query = query.filter(
            or_(
                Transaction.display_name.ilike(pattern),
                Transaction.payee_normalized.ilike(pattern),
                Transaction.payee_raw.ilike(pattern),
            )
        )
    if amount_sign == "positive":
        query = query.filter(Transaction.amount_cents > 0)
    elif amount_sign == "negative":
        query = query.filter(Transaction.amount_cents < 0)
    if include_transfers is not None and not include_transfers:
        query = query.filter(Transaction.transaction_type != TransactionType.TRANSFER)

    return query.order_by(
        Transaction.posted_date,
        Transaction.created_at
    ).all()


@router.get("/balance-before")
def get_balance_before(
    account_id: int = Query(...),
    before_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Sum of all transactions in an account before the given date."""
    from sqlalchemy import func
    result = db.query(func.coalesce(func.sum(Transaction.amount_cents), 0)).filter(
        Transaction.account_id == account_id,
        Transaction.posted_date < before_date
    ).scalar()
    return {"balance_cents": result}


@router.get("/find-transfer-match", response_model=list[TransferMatchResponse])
def find_transfer_match(
    source_account_id: int = Query(...),
    target_account_id: int = Query(...),
    amount_cents: int = Query(...),
    posted_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """Find potential matching transactions in the target account for transfer linking."""
    dest_account = db.query(Account).filter(Account.id == target_account_id).first()
    if not dest_account:
        raise HTTPException(status_code=404, detail="Destination account not found")

    window_start = posted_date - timedelta(days=3)
    window_end = posted_date + timedelta(days=3)

    from sqlalchemy import func
    matches = db.query(Transaction).filter(
        Transaction.account_id == target_account_id,
        func.abs(Transaction.amount_cents) == abs(amount_cents),
        Transaction.posted_date >= window_start,
        Transaction.posted_date <= window_end,
        Transaction.transaction_type != TransactionType.TRANSFER,
        Transaction.transfer_link_id.is_(None)
    ).limit(5).all()

    return [
        TransferMatchResponse(
            transaction_id=tx.id,
            account_id=tx.account_id,
            account_name=dest_account.name,
            posted_date=tx.posted_date,
            amount_cents=tx.amount_cents,
            payee_raw=tx.payee_raw,
            display_name=tx.display_name,
            memo=tx.memo
        )
        for tx in matches
    ]


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Get a single transaction by ID."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.post("/", response_model=TransactionResponse, status_code=201)
def create_transaction(
    transaction: TransactionCreate,
    delete_match_id: int | None = Query(None),
    db: Session = Depends(get_db)
):
    """Create a new transaction."""
    # Verify account exists
    account = db.query(Account).filter(Account.id == transaction.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Delete matched transaction if specified (for transfer linking)
    if delete_match_id and transaction.transfer_to_account_id:
        match_tx = db.query(Transaction).filter(Transaction.id == delete_match_id).first()
        if match_tx:
            db.delete(match_tx)
            db.flush()

    # Handle transfer transactions
    if transaction.transfer_to_account_id:
        return _create_transfer(transaction, db)

    db_transaction = Transaction(**transaction.model_dump(exclude={"transfer_to_account_id"}))
    db.add(db_transaction)
    db.flush()
    apply_payee_match(db, db_transaction)
    db.flush()
    db.refresh(db_transaction)
    return db_transaction


def _create_transfer(transaction: TransactionCreate, db: Session) -> Transaction:
    """Create a transfer (two linked transactions)."""
    # Verify destination account exists
    dest_account = db.query(Account).filter(
        Account.id == transaction.transfer_to_account_id
    ).first()
    if not dest_account:
        raise HTTPException(status_code=404, detail="Destination account not found")

    # Create outflow transaction (negative amount)
    source_account = db.query(Account).filter(Account.id == transaction.account_id).first()
    outflow = Transaction(
        account_id=transaction.account_id,
        posted_date=transaction.posted_date,
        amount_cents=-abs(transaction.amount_cents),
        payee_normalized=f"Transfer to {dest_account.name}",
        display_name=f"Transfer to {dest_account.name}",
        memo=transaction.memo,
        transaction_type=TransactionType.TRANSFER,
        source=transaction.source
    )
    db.add(outflow)
    db.flush()

    # Create inflow transaction (positive amount)
    inflow = Transaction(
        account_id=transaction.transfer_to_account_id,
        posted_date=transaction.posted_date,
        amount_cents=abs(transaction.amount_cents),
        payee_normalized=f"Transfer from {source_account.name}",
        display_name=f"Transfer from {source_account.name}",
        memo=transaction.memo,
        transaction_type=TransactionType.TRANSFER,
        source=transaction.source,
        transfer_link_id=outflow.id
    )
    db.add(inflow)
    db.flush()

    # Link outflow to inflow
    outflow.transfer_link_id = inflow.id
    db.flush()
    db.refresh(outflow)

    return outflow


@router.post("/{transaction_id}/convert-to-transfer", response_model=TransactionResponse)
def convert_to_transfer(
    transaction_id: int,
    request: ConvertToTransferRequest,
    db: Session = Depends(get_db)
):
    """Convert a regular transaction into a transfer with a linked counterpart."""
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.transaction_type == TransactionType.TRANSFER:
        raise HTTPException(status_code=400, detail="Transaction is already a transfer")

    target_account = db.query(Account).filter(Account.id == request.target_account_id).first()
    if not target_account:
        raise HTTPException(status_code=404, detail="Target account not found")

    source_account = db.query(Account).filter(Account.id == tx.account_id).first()

    # Delete matched transaction if specified (duplicate in target account)
    if request.delete_match_id:
        match_tx = db.query(Transaction).filter(Transaction.id == request.delete_match_id).first()
        if match_tx:
            db.delete(match_tx)
            db.flush()

    # Determine direction from the original amount sign
    # Negative = outflow (money left this account → "Transfer to")
    # Positive = inflow (money came into this account → "Transfer from")
    is_outflow = tx.amount_cents < 0

    tx.transaction_type = TransactionType.TRANSFER
    tx.payee_raw = None
    tx.category_id = None

    if is_outflow:
        tx.amount_cents = -abs(tx.amount_cents)
        tx.payee_normalized = f"Transfer to {target_account.name}"
        tx.display_name = f"Transfer to {target_account.name}"
    else:
        tx.amount_cents = abs(tx.amount_cents)
        tx.payee_normalized = f"Transfer from {target_account.name}"
        tx.display_name = f"Transfer from {target_account.name}"
    db.flush()

    # Create the linked counterpart (opposite sign)
    linked = Transaction(
        account_id=request.target_account_id,
        posted_date=tx.posted_date,
        amount_cents=-tx.amount_cents,
        payee_normalized=f"Transfer {'from' if is_outflow else 'to'} {source_account.name}",
        display_name=f"Transfer {'from' if is_outflow else 'to'} {source_account.name}",
        memo=tx.memo,
        transaction_type=TransactionType.TRANSFER,
        source=tx.source,
        transfer_link_id=tx.id
    )
    db.add(linked)
    db.flush()

    tx.transfer_link_id = linked.id
    db.flush()
    db.refresh(tx)
    return tx


@router.post("/categorize-by-payee")
def categorize_by_payee(
    request: dict,
    db: Session = Depends(get_db)
):
    """Set category on all uncategorized transactions matching a payee."""
    payee = request.get("payee", "")
    category_id = request.get("category_id")
    account_id = request.get("account_id")

    if not payee or not category_id or not account_id:
        raise HTTPException(status_code=400, detail="payee, category_id, and account_id are required")

    # Match on payee_raw or display_name
    from sqlalchemy import or_
    matches = db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.category_id.is_(None),
        or_(
            Transaction.payee_raw == payee,
            Transaction.display_name == payee
        )
    ).all()

    for tx in matches:
        tx.category_id = category_id

    db.flush()
    return {"updated_count": len(matches)}


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    transaction: TransactionUpdate,
    db: Session = Depends(get_db)
):
    """Update a transaction."""
    db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    update_data = transaction.model_dump(exclude_unset=True)

    # Handle transfer auto-update
    if db_transaction.transfer_link_id and db_transaction.transaction_type == TransactionType.TRANSFER:
        linked = db.query(Transaction).filter(
            Transaction.id == db_transaction.transfer_link_id
        ).first()
        if linked:
            # Update linked transaction with mirrored changes
            if "amount_cents" in update_data:
                linked.amount_cents = -update_data["amount_cents"]
            if "posted_date" in update_data:
                linked.posted_date = update_data["posted_date"]
            if "memo" in update_data:
                linked.memo = update_data["memo"]

    for field, value in update_data.items():
        setattr(db_transaction, field, value)

    if "payee_raw" in update_data and "display_name" not in update_data:
        apply_payee_match(db, db_transaction)
        # If user explicitly set category_id, don't let payee match override it
        if "category_id" in update_data:
            db_transaction.category_id = update_data["category_id"]

    db.flush()
    db.refresh(db_transaction)
    return db_transaction


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Delete a transaction."""
    db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Delete linked transfer if exists
    if db_transaction.transfer_link_id:
        linked = db.query(Transaction).filter(
            Transaction.id == db_transaction.transfer_link_id
        ).first()
        if linked:
            # Break circular reference before deleting
            linked.transfer_link_id = None
            db_transaction.transfer_link_id = None
            db.flush()
            db.delete(linked)

    db.delete(db_transaction)
    return None
