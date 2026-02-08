from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import load_recent_books, add_recent_book, RecentBook
from ..database import open_book, close_book, is_book_open, get_current_book_path

router = APIRouter()


class BookPath(BaseModel):
    """Request body for opening/creating a book."""
    path: str
    name: str | None = None


class BookStatus(BaseModel):
    """Current book status."""
    is_open: bool
    path: str | None = None
    name: str | None = None


@router.get("/recent", response_model=list[RecentBook])
def get_recent_books():
    """Get list of recently opened books."""
    books = load_recent_books()
    # Filter out non-existent files
    return [b for b in books if Path(b.path).exists()]


@router.get("/status", response_model=BookStatus)
def get_book_status():
    """Get current book status."""
    path = get_current_book_path()
    return BookStatus(
        is_open=is_book_open(),
        path=str(path) if path else None,
        name=path.stem if path else None
    )


@router.post("/open", response_model=BookStatus)
def open_existing_book(book: BookPath):
    """Open an existing book file."""
    path = Path(book.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Book file not found")

    try:
        open_book(path)
        add_recent_book(path, book.name)
        return BookStatus(
            is_open=True,
            path=str(path),
            name=book.name or path.stem
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create", response_model=BookStatus)
def create_new_book(book: BookPath):
    """Create a new book file."""
    path = Path(book.path)
    if path.exists():
        raise HTTPException(status_code=400, detail="File already exists")

    # Ensure parent directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        open_book(path)
        add_recent_book(path, book.name)
        return BookStatus(
            is_open=True,
            path=str(path),
            name=book.name or path.stem
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BrowseEntry(BaseModel):
    name: str
    path: str
    is_dir: bool


@router.get("/browse", response_model=list[BrowseEntry])
def browse_filesystem(dir: str = Query(default="~")):
    """List directories and .db files in a directory."""
    target = Path(dir).expanduser().resolve()
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    entries = []
    try:
        for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if item.name.startswith('.'):
                continue
            if item.is_dir():
                entries.append(BrowseEntry(name=item.name, path=str(item), is_dir=True))
            elif item.suffix in ('.db', '.sqlite', '.sqlite3'):
                entries.append(BrowseEntry(name=item.name, path=str(item), is_dir=False))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return entries


@router.get("/browse/parent")
def browse_parent(dir: str = Query(default="~")):
    """Get the parent directory path."""
    target = Path(dir).expanduser().resolve()
    return {"path": str(target.parent)}


@router.post("/close")
def close_current_book():
    """Close the current book."""
    if not is_book_open():
        raise HTTPException(status_code=400, detail="No book is open")
    close_book()
    return {"message": "Book closed"}
