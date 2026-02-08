import json
import os
from pathlib import Path
from pydantic import BaseModel
from datetime import datetime

# Config directory — use BUDGET_DATA_DIR env var if set (e.g. /data in Docker),
# otherwise fall back to ~/.config/budget for local dev
_data_dir = os.environ.get("BUDGET_DATA_DIR")
CONFIG_DIR = Path(_data_dir) / "config" if _data_dir else Path.home() / ".config" / "budget"
RECENT_BOOKS_FILE = CONFIG_DIR / "recent.json"


class RecentBook(BaseModel):
    """A recently opened book."""
    path: str
    name: str
    last_opened: datetime
    last_backup: datetime | None = None


def ensure_config_dir() -> None:
    """Ensure the config directory exists."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_recent_books() -> list[RecentBook]:
    """Load the list of recently opened books."""
    ensure_config_dir()
    if not RECENT_BOOKS_FILE.exists():
        return []

    try:
        with open(RECENT_BOOKS_FILE, "r") as f:
            data = json.load(f)
            return [RecentBook(**item) for item in data]
    except (json.JSONDecodeError, KeyError):
        return []


def save_recent_books(books: list[RecentBook]) -> None:
    """Save the list of recently opened books."""
    ensure_config_dir()
    with open(RECENT_BOOKS_FILE, "w") as f:
        json.dump([book.model_dump(mode="json") for book in books], f, indent=2, default=str)


def add_recent_book(path: Path, name: str | None = None) -> None:
    """Add or update a book in the recent books list."""
    books = load_recent_books()
    path_str = str(path.resolve())

    # Preserve last_backup from existing entry
    existing_backup = None
    for b in books:
        if b.path == path_str:
            existing_backup = b.last_backup
            break

    # Remove if already exists
    books = [b for b in books if b.path != path_str]

    # Add to front
    books.insert(0, RecentBook(
        path=path_str,
        name=name or path.stem,
        last_opened=datetime.utcnow(),
        last_backup=existing_backup,
    ))

    # Keep only last 10
    books = books[:10]

    save_recent_books(books)


def update_backup_timestamp(path: Path) -> None:
    """Update the last_backup timestamp for a book."""
    books = load_recent_books()
    path_str = str(path.resolve())
    for book in books:
        if book.path == path_str:
            book.last_backup = datetime.utcnow()
    save_recent_books(books)


def get_backup_status(path: Path) -> dict:
    """Get backup status for a book."""
    books = load_recent_books()
    path_str = str(path.resolve())
    for book in books:
        if book.path == path_str and book.last_backup:
            days = (datetime.utcnow() - book.last_backup).days
            return {"last_backup": book.last_backup.isoformat(), "days_since_backup": days}
    return {"last_backup": None, "days_since_backup": None}


def rename_book(path: Path, new_name: str) -> None:
    """Rename a book in the recent books list."""
    books = load_recent_books()
    path_str = str(path.resolve())
    for book in books:
        if book.path == path_str:
            book.name = new_name
    save_recent_books(books)


def get_book_name(path: Path) -> str | None:
    """Get the stored display name for a book."""
    books = load_recent_books()
    path_str = str(path.resolve())
    for book in books:
        if book.path == path_str:
            return book.name
    return None


def remove_recent_book(path: Path) -> None:
    """Remove a book from the recent books list."""
    books = load_recent_books()
    path_str = str(path.resolve())
    books = [b for b in books if b.path != path_str]
    save_recent_books(books)
