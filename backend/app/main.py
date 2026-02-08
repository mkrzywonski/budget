import webbrowser
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .api import api_router
from .database import close_book


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    yield
    # Cleanup on shutdown
    close_book()


app = FastAPI(
    title="Personal Finance Ledger",
    description="Local-first personal finance application",
    version="0.1.0",
    lifespan=lifespan
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(api_router, prefix="/api")


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Serve frontend static files in production (must be last — catches all unmatched routes)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
