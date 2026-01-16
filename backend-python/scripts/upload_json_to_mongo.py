#!/usr/bin/env python3
"""
Utility script to upload JSON data to MongoDB Atlas

Usage:
    python upload_json_to_mongo.py <collection_name> <json_file_path> [--replace] [--upsert]

Examples:
    python upload_json_to_mongo.py users cache/users.json
    python upload_json_to_mongo.py marketlists ../docs/others/tickers.json --replace
    python upload_json_to_mongo.py master_tickers public/master_tickers.json --replace

Options:
    --replace: Drop the collection before inserting (destructive)
    --upsert:  Use upsert mode for documents with _id field
"""

import json
import sys
import os
from pathlib import Path
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from pymongo.errors import DuplicateKeyError
from bson import ObjectId
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_mongo_client():
    """Create MongoDB client with Atlas support"""
    mongo_uri = os.getenv('MONGO_URI') or os.getenv('MONGO_CONNECTION_STRING') or 'mongodb://localhost:27017'
    db_name = os.getenv('MONGO_DB_NAME') or os.getenv('DB_NAME') or 'stock_anomaly_db'
    
    is_atlas = mongo_uri.startswith('mongodb+srv')
    
    try:
        if is_atlas:
            client = MongoClient(
                mongo_uri,
                server_api=ServerApi('1'),
                serverSelectionTimeoutMS=8000
            )
            # Verify connectivity
            client.admin.command('ping')
            print(f'✅ Connected to MongoDB Atlas: {db_name}')
        else:
            client = MongoClient(
                mongo_uri,
                serverSelectionTimeoutMS=5000
            )
            print(f'✅ Connected to Local MongoDB: {db_name}')
        
        return client, db_name
    except Exception as e:
        print(f'❌ Connection failed: {e}')
        sys.exit(1)

def convert_oid_to_objectid(obj):
    """Recursively convert MongoDB Extended JSON $oid format to ObjectId"""
    if isinstance(obj, dict):
        if '_id' in obj and isinstance(obj['_id'], dict) and '$oid' in obj['_id']:
            # Convert $oid format to ObjectId
            obj['_id'] = ObjectId(obj['_id']['$oid'])
        # Recursively process other dict values
        for key, value in obj.items():
            obj[key] = convert_oid_to_objectid(value)
    elif isinstance(obj, list):
        # Recursively process list items
        return [convert_oid_to_objectid(item) for item in obj]
    return obj

def load_json_file(file_path):
    """Load and parse JSON file (supports both JSON array and NDJSON formats)"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        
        # Try standard JSON first
        try:
            data = json.loads(content)
            # Normalize to list
            if isinstance(data, dict):
                data = [data]
                print('⚠️  JSON data was not an array, wrapped in array')
            # Convert $oid format to ObjectId
            data = [convert_oid_to_objectid(doc) for doc in data]
            return data
        except json.JSONDecodeError:
            # Try NDJSON format (newline-delimited JSON)
            lines = content.split('\n')
            data = []
            for i, line in enumerate(lines, 1):
                if line.strip():
                    try:
                        doc = json.loads(line)
                        # Convert $oid format to ObjectId
                        doc = convert_oid_to_objectid(doc)
                        data.append(doc)
                    except json.JSONDecodeError as e:
                        print(f'⚠️  Skipping invalid JSON on line {i}: {e}')
            
            if data:
                print(f'✅ Loaded NDJSON format ({len(data)} records)')
                return data
            else:
                raise json.JSONDecodeError('No valid JSON found', content, 0)
    
    except FileNotFoundError:
        print(f'❌ File not found: {file_path}')
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f'❌ Invalid JSON: {e}')
        sys.exit(1)

def upload_to_mongo(collection_name, json_data, replace_mode=False, upsert_mode=False):
    """Upload JSON data to MongoDB"""
    client, db_name = get_mongo_client()
    
    try:
        db = client[db_name]
        collection = db[collection_name]
        
        print(f'\n📂 Uploading to MongoDB...')
        print(f'   Collection: {collection_name}')
        print(f'   Records: {len(json_data)}')
        print(f'   Replace Mode: {"YES (⚠️  destructive)" if replace_mode else "NO"}')
        print(f'   Upsert Mode: {"YES" if upsert_mode else "NO"}')
        
        if len(json_data) == 0:
            print('⚠️  No data to upload')
            return
        
        # Drop collection if replace mode
        if replace_mode:
            print(f'\n🗑️  Dropping existing collection...')
            collection.drop()
            print('✅ Collection dropped')
        
        # Upload data
        print(f'\n📤 Uploading data...')
        
        if upsert_mode and any('_id' in doc for doc in json_data):
            # Upsert mode
            upserted = 0
            modified = 0
            
            for doc in json_data:
                if '_id' in doc:
                    result = collection.update_one(
                        {'_id': doc['_id']},
                        {'$set': doc},
                        upsert=True
                    )
                    upserted += result.upserted_id is not None
                    modified += result.modified_count
                else:
                    collection.insert_one(doc)
            
            print(f'✅ Upserted documents')
            print(f'   Upserted: {upserted}')
            print(f'   Modified: {modified}')
        else:
            # Insert mode
            try:
                result = collection.insert_many(json_data, ordered=False)
                print(f'✅ Inserted {len(result.inserted_ids)} documents')
            except Exception as e:
                if 'duplicate key error' in str(e).lower():
                    print(f'⚠️  Some documents already exist. Use --upsert to update existing records.')
                    # Try inserting remaining documents
                    inserted = 0
                    for doc in json_data:
                        try:
                            collection.insert_one(doc)
                            inserted += 1
                        except DuplicateKeyError:
                            pass
                    if inserted > 0:
                        print(f'✅ Inserted {inserted} new documents')
                else:
                    raise
        
        # Verify
        count = collection.count_documents({})
        print(f'\n📊 Upload Summary:')
        print(f'   Total in collection: {count}')
        
        print(f'\n✅ Upload completed successfully!\n')
        
    except Exception as e:
        print(f'\n❌ Error during upload: {e}')
        sys.exit(1)
    finally:
        client.close()

def main():
    """Main entry point"""
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    
    collection_name = sys.argv[1]
    json_file_path = sys.argv[2]
    flags = sys.argv[3:]
    
    replace_mode = '--replace' in flags
    upsert_mode = '--upsert' in flags
    
    # Resolve file path
    if not os.path.isabs(json_file_path):
        json_file_path = os.path.join(os.path.dirname(__file__), json_file_path)
    
    print(f'\n📂 Uploading JSON to MongoDB Atlas...')
    print(f'   File: {json_file_path}')
    print(f'   Collection: {collection_name}\n')
    
    # Load data
    print('📖 Reading JSON file...')
    json_data = load_json_file(json_file_path)
    print(f'✅ Loaded {len(json_data)} records')
    
    # Upload
    upload_to_mongo(collection_name, json_data, replace_mode, upsert_mode)

if __name__ == '__main__':
    main()
