from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Account, Transaction
from ..schemas import AccountCreate, AccountUpdate, AccountResponse

router = APIRouter()


@router.get("/", response_model=list[AccountResponse])
def list_accounts(db: Session = Depends(get_db)):
    """Get all accounts."""
    return db.query(Account).order_by(Account.display_order, Account.name).all()


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(account_id: int, db: Session = Depends(get_db)):
    """Get a single account by ID."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/", response_model=AccountResponse, status_code=201)
def create_account(account: AccountCreate, db: Session = Depends(get_db)):
    """Create a new account."""
    db_account = Account(**account.model_dump())
    db.add(db_account)
    db.flush()
    db.refresh(db_account)
    return db_account


@router.patch("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    account: AccountUpdate,
    db: Session = Depends(get_db)
):
    """Update an account."""
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")

    update_data = account.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_account, field, value)

    db.flush()
    db.refresh(db_account)
    return db_account


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    """Delete an account and all its transactions."""
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Break transfer links to avoid circular FK constraint failures
    db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.transfer_link_id.isnot(None)
    ).update({Transaction.transfer_link_id: None}, synchronize_session=False)

    # Also break links FROM other accounts pointing TO transactions in this account
    tx_ids = [t.id for t in db.query(Transaction.id).filter(Transaction.account_id == account_id).all()]
    if tx_ids:
        db.query(Transaction).filter(
            Transaction.transfer_link_id.in_(tx_ids)
        ).update({Transaction.transfer_link_id: None}, synchronize_session=False)

    db.flush()

    # Now delete all transactions in this account
    db.query(Transaction).filter(Transaction.account_id == account_id).delete(synchronize_session=False)
    db.flush()

    db.delete(db_account)
    return None
