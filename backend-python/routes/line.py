from fastapi import APIRouter
import httpx
from datetime import datetime, timedelta
from fastapi import Depends
from pymongo import MongoClient
from auth import LoginRequest, create_access_token, get_current_user
import os
import dotenv

dotenv.load_dotenv()

db = MongoClient(os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017"))[os.getenv("DB_NAME", "stock_anomaly_db")]
ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720")

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
        "redirect_uri": "http://localhost:5173/auth/callback", 
        "client_id": "2008465838", 
        "client_secret": "a2e48522809b3c48c13981e65501ab11"
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

        # 3. --- MODIFIED: Save to MongoDB ---
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
        db.users.update_one(
            {"line_user_id": line_user_id},
            {"$set": user_document, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

        # 4. --- MODIFIED: Create and return JWT Token ---
        token_expires = timedelta(minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES))
        router_token = create_access_token(
            data={"sub": line_user_id}, expires_delta=token_expires
        )
        
        # Return both the user profile and our router's token
        return {"user": profile_json, "token": router_token}

# --- NEW ENDPOINT: Required for session persistence ---
@router.get("/users/me")
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