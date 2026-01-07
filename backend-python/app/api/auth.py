from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import httpx
from jose import jwt, JWTError
import os
import logging
from bson import ObjectId
import json
from pathlib import Path
from core.config import db as mongo_db, logger as config_logger

logger = logging.getLogger(__name__)

# --- Config ---
"""Use same JWT secret names as Node so tokens are verifiable by the Node gateway.
Prefer `JWT_SECRET_KEY` / `JWT_ALGORITHM` if present, fall back to older names."""
SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY", "replace-me-with-a-random-secret")
ALGORITHM = os.getenv("JWT_ALGORITHM") or os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# Use centralized MongoDB from core.config
db = mongo_db

# JSON fallback file for users when MongoDB unavailable
USERS_JSON_FILE = Path(__file__).parent.parent.parent / "cache" / "users.json"

LINE_CLIENT_ID = os.getenv("LINE_CLIENT_ID")
LINE_CLIENT_SECRET = os.getenv("LINE_CLIENT_SECRET")
LINE_REDIRECT_URI = os.getenv("LINE_REDIRECT_URI")

router = APIRouter()

# --- Helper: User Storage (MongoDB or JSON fallback) ---
def read_users_json():
    """Read users from JSON file fallback."""
    try:
        if USERS_JSON_FILE.exists():
            with open(USERS_JSON_FILE) as f:
                return json.load(f) or []
    except Exception as e:
        logger.warning(f"Failed to read users.json: {e}")
    return []

def write_users_json(users_list):
    """Write users to JSON file fallback."""
    try:
        USERS_JSON_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(USERS_JSON_FILE, 'w') as f:
            json.dump(users_list, f, indent=2, default=str)
    except Exception as e:
        logger.warning(f"Failed to write users.json: {e}")

def find_user_by_lineid(lineid):
    """Find user by LINE ID (MongoDB or JSON)."""
    if db is not None:
        return db.users.find_one({"lineid": lineid})
    else:
        users = read_users_json()
        return next((u for u in users if u.get("lineid") == lineid), None)

def upsert_user_line(lineid, profile_json):
    """Create or update user with LINE data."""
    user_document = {
        "lineid": lineid,
        "email": "",
        "name": profile_json.get("displayName"),
        "username": "",
        "createdAt": datetime.utcnow(),
        "role": "user",
        "pictureUrl": profile_json.get("pictureUrl"),
        "lastLogin": datetime.utcnow(),
        "loginMethod": "line",
        "sentOption": "line",
        "timeZone": "Asia/Tokyo"
    }
    
    if db is not None:
        result = db.users.insert_one(user_document)
        user_document["_id"] = str(result.inserted_id)
        return user_document
    else:
        # JSON fallback: generate simple string ID
        import uuid
        user_document["_id"] = str(uuid.uuid4())
        users = read_users_json()
        users.append(user_document)
        write_users_json(users)
        return user_document

# --- Pydantic Models ---
class LineLoginRequest(BaseModel):
    code: str
    state: Optional[str] = None

# --- JWT Functions ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    # Ensure subject is a string (Node expects string sub)
    to_encode = data.copy()
    if "sub" in to_encode and to_encode["sub"] is not None:
        try:
            to_encode["sub"] = str(to_encode["sub"])
        except Exception:
            pass
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub") # This is now the MongoDB _id (string)
        if not user_id_str:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # REVISED: Look up user by MongoDB ObjectId
    try:
        if db is not None:
            oid = ObjectId(user_id_str)
            user = db.users.find_one({"_id": oid})
            if user:
                user["_id"] = str(user["_id"])
                return user
        else:
            # JSON fallback: look up by string ID
            users = read_users_json()
            for u in users:
                if str(u.get("_id")) == user_id_str:
                    return u
    except Exception as e:
        logger.debug(f"User lookup failed: {e}")
    
    raise credentials_exception

# --- LINE callback ---
@router.post("/auth/line/callback")
async def login_or_register_line(request: LineLoginRequest):
    try:
        async with httpx.AsyncClient() as client_http:
            # 1. Exchange code for token (Unchanged)
            token_url = "https://api.line.me/oauth2/v2.1/token"
            token_data = {
                "grant_type": "authorization_code",
                "code": request.code,
                "redirect_uri": LINE_REDIRECT_URI,
                "client_id": LINE_CLIENT_ID,
                "client_secret": LINE_CLIENT_SECRET,
            }
            token_res = await client_http.post(token_url, data=token_data)
            token_json = token_res.json()
            if "error" in token_json:
                raise HTTPException(status_code=400, detail=token_json.get("error_description"))

            access_token = token_json.get("access_token")

            # 2. Fetch LINE profile (Unchanged)
            profile_res = await client_http.get(
                "https://api.line.me/v2/profile",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            profile_json = profile_res.json()
            lineid = profile_json.get("userId")
            if not lineid:
                raise HTTPException(status_code=400, detail="Failed to fetch LINE user profile")

            # 3. Check state for binding/integration
            user = None
            if request.state and request.state.startswith("integrate-"):
                raw = request.state.replace("integrate-", "")
                user_id_to_bind = raw.split("-")[0]
                try:
                    if db is not None:
                        oid = ObjectId(user_id_to_bind)
                        user = db.users.find_one({"_id": oid})
                        if user:
                            db.users.update_one({"_id": oid}, {"$set": {
                                "lineid": lineid,
                                "pictureUrl": profile_json.get("pictureUrl"),
                                "lastLogin": datetime.utcnow(),
                                "loginMethod": "line",
                            }})
                    else:
                        users = read_users_json()
                        for u in users:
                            if str(u.get("_id")) == user_id_to_bind:
                                u["lineid"] = lineid
                                u["pictureUrl"] = profile_json.get("pictureUrl")
                                u["lastLogin"] = datetime.utcnow()
                                u["loginMethod"] = "line"
                                user = u
                        write_users_json(users)
                except Exception as e:
                    logger.debug(f"Binding error: {e}")

            # 4. Login/register if not binding
            if not user:
                user = find_user_by_lineid(lineid)
                if user:
                    # Update lastLogin
                    if db is not None:
                        db.users.update_one({"lineid": lineid}, {"$set": {"lastLogin": datetime.utcnow()}})
                    else:
                        users = read_users_json()
                        for u in users:
                            if u.get("lineid") == lineid:
                                u["lastLogin"] = datetime.utcnow()
                        write_users_json(users)
                else:
                    user = upsert_user_line(lineid, profile_json)

            user["_id"] = str(user["_id"])

            # 5. Generate JWT using '_id' (string) as the subject
            user_mongo_id = user["_id"] 
            token_jwt = create_access_token({"sub": user_mongo_id}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

            return {"user": user, "token": token_jwt}

    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    
# --- Endpoint to fetch current profile ---
@router.get("/profile")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user.get("_id"),          # MongoDB ID
        "name": current_user.get("name"),        # Correct field name
        "username": current_user.get("username"), # Correct field name
        "email": current_user.get("email"),      # Correct field name
        "pictureUrl": current_user.get("pictureUrl"), # Correct field name
        "lineid": current_user.get("lineid"),    # LINE ID if linked
        "loginMethod": current_user.get("loginMethod"), # e.g., 'line', 'email'
    }
