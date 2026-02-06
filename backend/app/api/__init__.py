from fastapi import APIRouter

from .books import router as books_router
from .accounts import router as accounts_router
from .transactions import router as transactions_router
from .categories import router as categories_router
from .imports import router as imports_router
from .payees import router as payees_router

api_router = APIRouter()

api_router.include_router(books_router, prefix="/books", tags=["books"])
api_router.include_router(accounts_router, prefix="/accounts", tags=["accounts"])
api_router.include_router(transactions_router, prefix="/transactions", tags=["transactions"])
api_router.include_router(categories_router, prefix="/categories", tags=["categories"])
api_router.include_router(imports_router, prefix="/import", tags=["import"])
api_router.include_router(payees_router, prefix="/payees", tags=["payees"])
