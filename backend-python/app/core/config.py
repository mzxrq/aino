import os
import logging
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

logger = logging.getLogger("stock-dashboard.backend-python.config")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Environment
CHANNEL_ACCESS_TOKEN = os.getenv("CHANNEL_ACCESS_TOKEN")
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_CONNECTION_STRING") or "mongodb://localhost:27017"
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME") or os.getenv("DB_NAME") or "stock_anomaly_db"

if not CHANNEL_ACCESS_TOKEN:
    logger.warning("CHANNEL_ACCESS_TOKEN not set — LINE messages will be skipped or fail.")

if not os.getenv("MONGO_URI") and not os.getenv("MONGO_CONNECTION_STRING"):
    logger.warning("MONGO_URI not set — defaulting to mongodb://localhost:27017")

# MongoDB client
try:
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    logger.info(f"Connected to MongoDB at {MONGO_URI}; using DB '{MONGO_DB_NAME}'")
except Exception as e:
    logger.exception(f"Failed to create MongoClient: {e}")
    client = None
    db = None
