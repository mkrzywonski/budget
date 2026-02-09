import shutil
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from ..config import load_recent_books, add_recent_book, update_backup_timestamp, get_backup_status, rename_book, get_book_name, RecentBook
from ..database import open_book, close_book, is_book_open, get_current_book_path, check_book_has_password, verify_book_password, hash_password, verify_password, get_db
from ..models import BookSettings

router = APIRouter()


class BookPath(BaseModel):
    """Request body for opening/creating a book."""
    path: str
    name: str | None = None
    password: str | None = None


class BookStatus(BaseModel):
    """Current book status."""
    is_open: bool
    path: str | None = None
    name: str | None = None
    has_password: bool = False


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
    name = None
    has_pw = False
    if path:
        name = get_book_name(path) or path.stem
        has_pw = check_book_has_password(path)
    return BookStatus(
        is_open=is_book_open(),
        path=str(path) if path else None,
        name=name,
        has_password=has_pw,
    )


@router.post("/open", response_model=BookStatus)
def open_existing_book(book: BookPath):
    """Open an existing book file."""
    path = Path(book.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Book file not found")

    # Check password before opening
    if check_book_has_password(path):
        if not book.password:
            raise HTTPException(status_code=403, detail="Password required")
        if not verify_book_password(path, book.password):
            raise HTTPException(status_code=403, detail="Incorrect password")

    try:
        open_book(path)
        add_recent_book(path, book.name)
        return BookStatus(
            is_open=True,
            path=str(path),
            name=book.name or path.stem,
            has_password=check_book_has_password(path),
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


class RenameRequest(BaseModel):
    name: str


@router.patch("/rename", response_model=BookStatus)
def rename_current_book(req: RenameRequest):
    """Rename the current book's display name."""
    path = get_current_book_path()
    if not path:
        raise HTTPException(status_code=400, detail="No book is open")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    rename_book(path, name)
    return BookStatus(is_open=True, path=str(path), name=name)


@router.get("/backup")
def backup_book():
    """Download a backup of the current book."""
    book_path = get_current_book_path()
    if not book_path:
        raise HTTPException(status_code=400, detail="No book is open")

    # Use SQLite online backup API for a consistent snapshot
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    tmp_path = Path(tmp.name)

    try:
        src = sqlite3.connect(str(book_path))
        dst = sqlite3.connect(str(tmp_path))
        src.backup(dst)
        src.close()
        dst.close()
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")

    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"{book_path.stem}_backup_{date_str}.db"

    def cleanup_and_update():
        tmp_path.unlink(missing_ok=True)
        update_backup_timestamp(book_path)

    return FileResponse(
        path=str(tmp_path),
        filename=filename,
        media_type="application/octet-stream",
        background=BackgroundTask(cleanup_and_update),
    )


@router.post("/restore")
async def restore_book(file: UploadFile = File(...)):
    """Restore a book from an uploaded backup file."""
    book_path = get_current_book_path()
    if not book_path:
        raise HTTPException(status_code=400, detail="No book is open")

    # Save upload to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    try:
        contents = await file.read()
        tmp.write(contents)
        tmp.close()

        # Validate the uploaded file
        try:
            conn = sqlite3.connect(tmp.name)
            result = conn.execute("PRAGMA integrity_check").fetchone()
            conn.close()
            if result[0] != "ok":
                raise HTTPException(status_code=400, detail="Uploaded file failed integrity check")
        except sqlite3.DatabaseError:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid SQLite database")

        # Close current book, replace file, re-open
        close_book()
        shutil.copy2(tmp.name, str(book_path))
        open_book(book_path)

        return BookStatus(
            is_open=True,
            path=str(book_path),
            name=book_path.stem,
        )
    finally:
        Path(tmp.name).unlink(missing_ok=True)


@router.get("/backup-status")
def backup_status():
    """Get backup status for the current book."""
    book_path = get_current_book_path()
    if not book_path:
        raise HTTPException(status_code=400, detail="No book is open")
    return get_backup_status(book_path)


class SetPasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str


class RemovePasswordRequest(BaseModel):
    current_password: str


@router.post("/password")
def set_book_password(req: SetPasswordRequest):
    """Set or change the book password."""
    if not is_book_open():
        raise HTTPException(status_code=400, detail="No book is open")

    db = next(get_db())
    try:
        settings = db.query(BookSettings).filter(BookSettings.id == 1).first()

        # If password already set, verify current password
        if settings and settings.password_hash:
            if not req.current_password:
                raise HTTPException(status_code=403, detail="Current password required")
            if not verify_password(req.current_password, settings.password_salt, settings.password_hash):
                raise HTTPException(status_code=403, detail="Incorrect current password")

        new_hash, new_salt = hash_password(req.new_password)

        if settings:
            settings.password_hash = new_hash
            settings.password_salt = new_salt
        else:
            settings = BookSettings(id=1, password_hash=new_hash, password_salt=new_salt)
            db.add(settings)

        db.commit()
        return {"message": "Password set"}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/password/remove")
def remove_book_password(req: RemovePasswordRequest):
    """Remove the book password."""
    if not is_book_open():
        raise HTTPException(status_code=400, detail="No book is open")

    db = next(get_db())
    try:
        settings = db.query(BookSettings).filter(BookSettings.id == 1).first()

        if not settings or not settings.password_hash:
            raise HTTPException(status_code=400, detail="No password is set")

        if not verify_password(req.current_password, settings.password_salt, settings.password_hash):
            raise HTTPException(status_code=403, detail="Incorrect password")

        settings.password_hash = None
        settings.password_salt = None
        db.commit()
        return {"message": "Password removed"}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
