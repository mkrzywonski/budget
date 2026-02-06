from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract

from ..database import get_db
from ..models import Transaction, Account, TransactionType
from ..schemas import TransactionCreate, TransactionUpdate, TransactionResponse
from ..services.payee_matcher import apply_payee_match

router = APIRouter()


@router.get("/", response_model=list[TransactionResponse])
def list_transactions(
    account_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db)
):
    """
    Get transactions with optional filters.

    If year/month provided, returns transactions for that month.
    Otherwise returns all transactions for the account.
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

    return query.order_by(
        Transaction.posted_date,
        Transaction.created_at
    ).all()


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
    db: Session = Depends(get_db)
):
    """Create a new transaction."""
    # Verify account exists
    account = db.query(Account).filter(Account.id == transaction.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

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
    outflow = Transaction(
        account_id=transaction.account_id,
        posted_date=transaction.posted_date,
        amount_cents=-abs(transaction.amount_cents),
        payee_normalized=f"Transfer to {dest_account.name}",
        memo=transaction.memo,
        transaction_type=TransactionType.TRANSFER,
        source=transaction.source
    )
    db.add(outflow)
    db.flush()

    # Create inflow transaction (positive amount)
    source_account = db.query(Account).filter(Account.id == transaction.account_id).first()
    inflow = Transaction(
        account_id=transaction.transfer_to_account_id,
        posted_date=transaction.posted_date,
        amount_cents=abs(transaction.amount_cents),
        payee_normalized=f"Transfer from {source_account.name}",
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
            db.delete(linked)

    db.delete(db_transaction)
    return None
