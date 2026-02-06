from datetime import datetime
from pydantic import BaseModel


class CategoryBase(BaseModel):
    """Base category fields."""
    name: str
    parent_id: int | None = None
    display_order: int = 0


class CategoryCreate(CategoryBase):
    """Fields for creating a category."""
    pass


class CategoryUpdate(BaseModel):
    """Fields for updating a category (all optional)."""
    name: str | None = None
    parent_id: int | None = None
    display_order: int | None = None


class CategoryResponse(CategoryBase):
    """Category response with all fields."""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
