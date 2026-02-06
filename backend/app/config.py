import json
from pathlib import Path
from pydantic import BaseModel
from datetime import datetime

# Config directory
CONFIG_DIR = Path.home() / ".config" / "budget"
RECENT_BOOKS_FILE = CONFIG_DIR / "recent.json"


class RecentBook(BaseModel):
    """A recently opened book."""
    path: str
    name: str
    last_opened: datetime


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

    # Remove if already exists
    books = [b for b in books if b.path != path_str]

    # Add to front
    books.insert(0, RecentBook(
        path=path_str,
        name=name or path.stem,
        last_opened=datetime.utcnow()
    ))

    # Keep only last 10
    books = books[:10]

    save_recent_books(books)


def remove_recent_book(path: Path) -> None:
    """Remove a book from the recent books list."""
    books = load_recent_books()
    path_str = str(path.resolve())
    books = [b for b in books if b.path != path_str]
    save_recent_books(books)
