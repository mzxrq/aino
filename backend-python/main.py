# Import Package

# backend-python/main.py


# Check if file existed
import os
import sys

# Ensure backend-python directory is on sys.path so local `resource` and `train` imports resolve
sys.path.insert(0, os.path.dirname(__file__) or '.')

# stocklist / model paths
from resource.stocklist import MODEL_PATHS

# training helper (top-level train.py)
from train import trained_model

# Check model files
def check_model_files():
    for market, path in MODEL_PATHS.items():
        if not os.path.exists(path):
            trained_model(market,path)
        else:
            print(f"{market} model found at {path}")


# FastAPI Setup
# main.py
from fastapi import FastAPI, Query, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np
import joblib
import httpx
from sklearn.ensemble import IsolationForest
import os

# --- NEW: Import Mongo, JWT, and helper libraries ---
from pymongo import MongoClient
from jose import JWTError, jwt
from passlib.context import CryptContext

# ----------------------------------------------------------------------
# 1. SECURITY & DATABASE CONFIGURATION (NEW!)
# ----------------------------------------------------------------------

from dotenv import load_dotenv

load_dotenv()

# --- OAuth2 Scheme (for /users/me) ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Database Connection ---
# Replace with your MongoDB Atlas connection string
MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING")
client = MongoClient(MONGO_CONNECTION_STRING)

# --- Password Hashing (if you add email/pass login later) ---
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ----------------------------------------------------------------------
# 2. APP & CORS SETUP (Updated)
# ----------------------------------------------------------------------
app = FastAPI(title="Stock Fraud Detection API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://host.docker.internal:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------
# 3. HELPER FUNCTIONS FOR AUTH (NEW!)
# ----------------------------------------------------------------------

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

from auth import create_access_token, get_current_user

from routes.line import router as line_router
app.include_router(line_router)