from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from services.news_service import fetch_news_for_ticker

router = APIRouter()


@router.get('/news')
def get_news(ticker: Optional[str] = Query(None, description="Ticker symbol"),
             page: int = Query(1, ge=1),
             pageSize: int = Query(10, ge=1, le=100)):
    """Fetch news for a ticker using yfinance with pagination.

    Query params:
      - ticker: ticker symbol (required)
      - page: 1-based page
      - pageSize: items per page (max 100)
    """
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker query parameter is required")

    result = fetch_news_for_ticker(ticker, page=page, page_size=pageSize)
    if 'error' in result:
        raise HTTPException(status_code=500, detail=result.get('error'))
    return result
