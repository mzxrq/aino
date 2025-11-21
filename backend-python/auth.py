import os
from datetime import datetime, timedelta
import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from jose import JWTError, jwt
from pymongo import MongoClient

# --- Pydantic request model used by the LINE callback
class LoginRequest(BaseModel):
    code: str


# OAuth2 setup
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# JWT + DB configuration with safe fallbacks
SECRET_KEY = os.getenv("SECRET_KEY", "replace-me-with-a-random-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
try:
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
except ValueError:
    ACCESS_TOKEN_EXPIRE_MINUTES = 10080

# MongoDB client
MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Creates a new JWT token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Decodes token and fetches user from DB. Used by /users/me"""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # --- MongoDB Integration ---
    # We use user_id (which is the LINE User ID) to find our user
    user = db.users.find_one({"line_user_id": user_id})

    if user is None:
        raise credentials_exception

    # Convert MongoDB's _id to a string
    user["_id"] = str(user["_id"])
    return user



