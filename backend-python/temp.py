from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()


db = MongoClient(os.getenv("MONGO_CONNECTION_STRING")).Test

distinct_items = db.subscriptions.distinct("tickers")
print(distinct_items)