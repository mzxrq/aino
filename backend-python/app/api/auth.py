from fastapi import APIRouter
import httpx
from datetime import datetime, timedelta
from fastapi import Depends
from pymongo import MongoClient
import os
import dotenv
import logging

logger = logging.getLogger(__name__)
dotenv.load_dotenv()

# MongoDB connection with authentication support
MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")

# Try to connect with authentication if credentials provided
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # Force connection attempt to validate credentials
    client.admin.command('ping')
    db = client[DB_NAME]
    logger.info("✓ MongoDB connected successfully")
except Exception as e:
    logger.warning(f"MongoDB connection failed ({e}). LINE callback will use file-based fallback.")
    db = None

ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720")

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

router = APIRouter()
# Use the `db` initialized in `auth.py` (single Mongo client for the package)

@router.post("/auth/line/callback")
async def login_line(request: LoginRequest):
    # 1. Exchange Code for Access Token
    token_url = "https://api.line.me/oauth2/v2.1/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "authorization_code",
        "code": request.code,
        "redirect_uri": os.getenv("LINE_REDIRECT_URI"), 
        "client_id": os.getenv("LINE_CLIENT_ID"), 
        "client_secret": os.getenv("LINE_CLIENT_SECRET")
    }
    
    async with httpx.AsyncClient() as client:
        token_res = await client.post(token_url, headers=headers, data=data)
        token_json = token_res.json()
        
        if "error" in token_json:
            return {"error": token_json.get("error_description")}
            
        access_token = token_json.get("access_token")
        
        # 2. Get User Profile
        profile_url = "https://api.line.me/v2/profile"
        profile_headers = {"Authorization": f"Bearer {access_token}"}
        profile_res = await client.get(profile_url, headers=profile_headers)
        profile_json = profile_res.json() # This is the user data from LINE

        # 3. --- MODIFIED: Save to MongoDB (with fallback) ---
        line_user_id = profile_json.get("userId")
        
        # Prepare user document based on your schema
        user_document = {
            "line_user_id": line_user_id,
            "display_name": profile_json.get("displayName"),
            "picture_url": profile_json.get("pictureUrl"),
            "status_message": profile_json.get("statusMessage"),
            "role": "general", # Default role
            "last_login": datetime.utcnow()
        }
        
        # Upsert: Find user by line_user_id and update them, or create if they don't exist
        if db is not None:
            try:
                db.users.update_one(
                    {"line_user_id": line_user_id},
                    {"$set": user_document, "$setOnInsert": {"created_at": datetime.utcnow()}},
                    upsert=True,
                )
                logger.info(f"User {line_user_id} saved to MongoDB")
            except Exception as e:
                logger.warning(f"Failed to save user to MongoDB: {e}. Continuing without persistence.")
        else:
            logger.info(f"MongoDB unavailable. User {line_user_id} session will not persist.")

        # 4. --- MODIFIED: Create and return JWT Token ---
        token_expires = timedelta(minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES))
        router_token = create_access_token(
            data={"sub": line_user_id}, expires_delta=token_expires
        )
        
        # Return both the user profile and our router's token
        return {"user": profile_json, "token": router_token}

# --- NEW ENDPOINT: Required for session persistence ---
@router.get("/profile")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    """
    Returns the user data for the currently authenticated user.
    AuthContext.jsx calls this on router load to restore the session.
    """
    # The 'current_user' is already fetched from the DB by get_current_user
    # We just need to format it to match what LINE sends, as React expects it
    user_profile = {
        "userId": current_user.get("line_user_id"),
        "displayName": current_user.get("display_name"),
        "pictureUrl": current_user.get("picture_url"),
        "statusMessage": current_user.get("status_message")
    }
    return user_profile