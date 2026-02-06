from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Category
from ..schemas import CategoryCreate, CategoryUpdate, CategoryResponse

router = APIRouter()


@router.get("/", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    """Get all categories."""
    return db.query(Category).order_by(Category.display_order, Category.name).all()


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, db: Session = Depends(get_db)):
    """Get a single category by ID."""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post("/", response_model=CategoryResponse, status_code=201)
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new category."""
    if category.parent_id:
        parent = db.query(Category).filter(Category.id == category.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")

    db_category = Category(**category.model_dump())
    db.add(db_category)
    db.flush()
    db.refresh(db_category)
    return db_category


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    category: CategoryUpdate,
    db: Session = Depends(get_db)
):
    """Update a category."""
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = category.model_dump(exclude_unset=True)

    if "parent_id" in update_data and update_data["parent_id"]:
        # Prevent circular references
        if update_data["parent_id"] == category_id:
            raise HTTPException(status_code=400, detail="Category cannot be its own parent")
        parent = db.query(Category).filter(Category.id == update_data["parent_id"]).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")

    for field, value in update_data.items():
        setattr(db_category, field, value)

    db.flush()
    db.refresh(db_category)
    return db_category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    """Delete a category."""
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check for child categories
    children = db.query(Category).filter(Category.parent_id == category_id).count()
    if children > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete category with subcategories"
        )

    db.delete(db_category)
    return None
