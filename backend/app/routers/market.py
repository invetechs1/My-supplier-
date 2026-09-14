from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import pricing

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return pricing.public_stats(db)


@router.get("/index")
def index(category_id: int | None = None, city: str | None = None, db: Session = Depends(get_db)):
    return pricing.market_index(db, category_id, city)


@router.get("/trending")
def trending_products(limit: int = 8, city: str | None = None, db: Session = Depends(get_db)):
    return pricing.trending(db, limit, city)
