import pandas as pd
from typing import List, Union, Dict, Any
from pydantic import BaseModel

from fastapi import APIRouter
from ticker_config import FraudRequest, group_by_ticker_to_json, detect_fraud


router = APIRouter()

@router.get("/")
def read_root():
    return {"message": "Welcome to the Fraud Detection API"}

@router.post("/detect", response_model=Dict[str, Any])
def detect_fraud_endpoint(request: FraudRequest):
    # Normalize request.ticker to a list of tickers
    if isinstance(request.ticker, list):
        tickers = request.ticker
    else:
        tickers = [request.ticker]

    # DataFrame returned from your model
    prediction = detect_fraud(tickers)

    # Group by ticker → dict
    prediction_json = group_by_ticker_to_json(prediction)

    return prediction_json