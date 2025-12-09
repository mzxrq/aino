from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import httpx
from jose import jwt, JWTError
from pymongo import MongoClient
import os
import dotenv
import logging
from bson import ObjectId

logger = logging.getLogger(__name__)
dotenv.load_dotenv()

# --- Config ---
SECRET_KEY = os.getenv("SECRET_KEY", "replace-me-with-a-random-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

MONGO_URI = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "stock_anomaly_db")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

LINE_CLIENT_ID = os.getenv("LINE_CLIENT_ID")
LINE_CLIENT_SECRET = os.getenv("LINE_CLIENT_SECRET")
LINE_REDIRECT_URI = os.getenv("LINE_REDIRECT_URI")

router = APIRouter()

# --- Pydantic Models ---
class LineLoginRequest(BaseModel):
    code: str
    state: Optional[str] = None

# --- JWT Functions ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- Dependency to get current user ---
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
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.users.find_one({"lineid": user_id})
    if not user:
        raise credentials_exception
    user["_id"] = str(user["_id"])
    return user

# --- LINE callback ---
@router.post("/auth/line/callback")
async def login_or_register_line(request: LineLoginRequest):
    try:
        async with httpx.AsyncClient() as client_http:
            # 1. Exchange code for token
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

            # 2. Fetch LINE profile
            profile_res = await client_http.get(
                "https://api.line.me/v2/profile",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            profile_json = profile_res.json()
            lineid = profile_json.get("userId")
            if not lineid:
                raise HTTPException(status_code=400, detail="Failed to fetch LINE user profile")

            # 3. Check state for binding
            user = None
            if request.state and request.state.startswith("integrate-"):
                # state format: integrate-<userId>-<nonce>; extract the first segment after prefix
                raw = request.state.replace("integrate-", "")
                user_id_to_bind = raw.split("-")[0]
                try:
                    oid = ObjectId(user_id_to_bind)
                except Exception:
                    oid = user_id_to_bind
                user = db.users.find_one({"_id": oid})
                if user:
                    db.users.update_one({"_id": oid}, {"$set": {
                        "lineid": lineid,
                        "pictureUrl": profile_json.get("pictureUrl"),
                        "lastLogin": datetime.utcnow(),
                        "loginMethod": "line"
                    }})

            # 4. Login/register if not binding
            if not user:
                user = db.users.find_one({"lineid": lineid})
                if user:
                    db.users.update_one({"lineid": lineid}, {"$set": {"lastLogin": datetime.utcnow()}})
                else:
                    user_document = {
                        "lineid": lineid,
                        "email" : "",
                        "name": profile_json.get("displayName"),
                        "username" : "",
                        "createdAt": datetime.utcnow(),
                        "role": "user",
                        "pictureUrl": profile_json.get("pictureUrl"),
                        "lastLogin": datetime.utcnow(),
                        "loginMethod": "line"
                    }
                    r = db.users.insert_one(user_document)
                    user = { **user_document, "_id": r.inserted_id }

            user["_id"] = str(user["_id"])

            # 5. Generate JWT
            token_jwt = create_access_token({"sub": lineid}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

            return {"user": user, "token": token_jwt}

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    
# --- Endpoint to fetch current profile ---
@router.get("/profile")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "userId": current_user.get("lineid"),
        "name": current_user.get("display_name"),
        "pictureUrl": current_user.get("picture_url"),
        "statusMessage": current_user.get("status_message")
    }
