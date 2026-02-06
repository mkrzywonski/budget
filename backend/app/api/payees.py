from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Payee
from ..schemas.payee import PayeeCreate, PayeeUpdate, PayeeResponse, RematchResponse
from ..services.payee_matcher import rematch_all

router = APIRouter()


@router.get("/", response_model=list[PayeeResponse])
def list_payees(db: Session = Depends(get_db)):
    """Get all payees."""
    return db.query(Payee).order_by(Payee.name).all()


@router.get("/{payee_id}", response_model=PayeeResponse)
def get_payee(payee_id: int, db: Session = Depends(get_db)):
    """Get a single payee by ID."""
    payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    return payee


@router.post("/", response_model=PayeeResponse, status_code=201)
def create_payee(payee: PayeeCreate, db: Session = Depends(get_db)):
    """Create a new payee."""
    db_payee = Payee(
        name=payee.name,
        match_patterns=[p.model_dump() for p in payee.match_patterns]
    )
    db.add(db_payee)
    db.flush()
    db.refresh(db_payee)
    return db_payee


@router.patch("/{payee_id}", response_model=PayeeResponse)
def update_payee(
    payee_id: int,
    payee: PayeeUpdate,
    db: Session = Depends(get_db)
):
    """Update a payee."""
    db_payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not db_payee:
        raise HTTPException(status_code=404, detail="Payee not found")

    update_data = payee.model_dump(exclude_unset=True)
    if "match_patterns" in update_data and update_data["match_patterns"] is not None:
        update_data["match_patterns"] = [
            p.model_dump() if hasattr(p, "model_dump") else p
            for p in update_data["match_patterns"]
        ]

    for field, value in update_data.items():
        setattr(db_payee, field, value)

    db.flush()
    db.refresh(db_payee)
    return db_payee


@router.delete("/{payee_id}", status_code=204)
def delete_payee(payee_id: int, db: Session = Depends(get_db)):
    """Delete a payee."""
    db_payee = db.query(Payee).filter(Payee.id == payee_id).first()
    if not db_payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    db.delete(db_payee)
    return None


@router.post("/rematch", response_model=RematchResponse)
def rematch_payees(db: Session = Depends(get_db)):
    """Re-run payee matching on all transactions."""
    updated_count = rematch_all(db)
    return RematchResponse(updated_count=updated_count)
