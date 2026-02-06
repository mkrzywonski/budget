from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Category(Base, TimestampMixin):
    """
    Spending category for transactions.
    Supports optional hierarchy (parent_id for subcategories).
    """

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Optional parent for hierarchical categories
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )

    # Display order within parent
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    parent: Mapped["Category | None"] = relationship(
        "Category", remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list["Category"]] = relationship(
        "Category", back_populates="parent"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="category"
    )

    def __repr__(self) -> str:
        return f"<Category(id={self.id}, name='{self.name}')>"
