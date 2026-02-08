from datetime import date
from pathlib import Path
from sqlalchemy import create_engine, event, text, inspect
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine import Engine

from .models import Base

# Global state for current book
_current_engine: Engine | None = None
_current_session_factory: sessionmaker | None = None


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign keys for SQLite."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def open_book(db_path: Path) -> None:
    """
    Open a book (SQLite database file).

    Creates the file and tables if it doesn't exist.
    """
    global _current_engine, _current_session_factory

    if _current_engine is not None:
        close_book()

    db_url = f"sqlite:///{db_path}"
    _current_engine = create_engine(db_url, echo=False)
    _current_session_factory = sessionmaker(bind=_current_engine)

    # Create tables if they don't exist
    Base.metadata.create_all(_current_engine)

    # Migrate existing tables: add missing columns
    _migrate_schema(_current_engine)

    # Clean up stale forecast dismissals
    _cleanup_old_dismissals(_current_engine)


def _migrate_schema(engine: Engine) -> None:
    """Add any missing columns to existing tables."""
    inspector = inspect(engine)

    # Define expected columns that may be missing from older databases
    # Format: (table_name, column_name, column_type_sql)
    migrations = [
        ("transactions", "display_name", "VARCHAR(255)"),
        ("transactions", "external_id", "VARCHAR(255)"),
        ("accounts", "show_running_balance", "BOOLEAN DEFAULT 1"),
        ("recurring_templates", "payee_id", "INTEGER REFERENCES payees(id)"),
    ]

    with engine.connect() as conn:
        for table, column, col_type in migrations:
            if not inspector.has_table(table):
                continue
            existing = [c["name"] for c in inspector.get_columns(table)]
            if column not in existing:
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
                ))
                conn.commit()


def _cleanup_old_dismissals(engine: Engine) -> None:
    """Delete forecast dismissals for months before the current month."""
    inspector = inspect(engine)
    if not inspector.has_table("forecast_dismissals"):
        return
    current_month = date.today().replace(day=1).isoformat()
    with engine.connect() as conn:
        conn.execute(text(
            f"DELETE FROM forecast_dismissals WHERE period_date < '{current_month}'"
        ))
        conn.commit()


def close_book() -> None:
    """Close the current book."""
    global _current_engine, _current_session_factory

    if _current_engine is not None:
        _current_engine.dispose()
        _current_engine = None
        _current_session_factory = None


def get_session() -> Session:
    """Get a database session for the current book."""
    if _current_session_factory is None:
        raise RuntimeError("No book is currently open")
    return _current_session_factory()


def get_db():
    """FastAPI dependency for database sessions."""
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def is_book_open() -> bool:
    """Check if a book is currently open."""
    return _current_engine is not None


def get_current_book_path() -> Path | None:
    """Get the path of the currently open book."""
    if _current_engine is None:
        return None
    # Extract path from SQLite URL
    url = str(_current_engine.url)
    if url.startswith("sqlite:///"):
        return Path(url[10:])
    return None
