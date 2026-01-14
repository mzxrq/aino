import os
import logging
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.server_api import ServerApi  # Required for Atlas Versioning

load_dotenv()

logger = logging.getLogger("stock-dashboard.backend-python.config")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# --- Configuration ---
CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME") or os.getenv("DB_NAME") or "stock_anomaly_db"

ENABLE_LINE_NOTIFICATIONS = os.getenv("ENABLE_LINE_NOTIFICATIONS", "true").lower() == "true"
ENABLE_EMAIL_NOTIFICATIONS = os.getenv("ENABLE_EMAIL_NOTIFICATIONS", "false").lower() == "true"

# --- Smart Connection Logic ---
is_atlas = MONGO_URI.startswith("mongodb+srv")

try:
    if is_atlas:
        # Atlas Configuration
        client = MongoClient(
            MONGO_URI,
            server_api=ServerApi('1'),
            serverSelectionTimeoutMS=8000
        )
        # Verify connectivity (The Atlas "Ping")
        client.admin.command('ping')
        logger.info(f"Connected to MongoDB Atlas: {MONGO_DB_NAME}")
    else:
        # Local Configuration
        client = MongoClient(
            MONGO_URI, 
            serverSelectionTimeoutMS=5000
        )
        logger.info(f"Connected to Local MongoDB: {MONGO_DB_NAME}")

    db = client[MONGO_DB_NAME]

except Exception as e:
    logger.exception(f"Failed to connect to MongoDB: {e}")
    client = None
    db = None

# --- Feature Flag Warnings ---
if not CHANNEL_ACCESS_TOKEN:
    logger.warning("CHANNEL_ACCESS_TOKEN not set — LINE messages will be skipped.")