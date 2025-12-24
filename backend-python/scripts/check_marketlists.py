import os, sys
# Ensure backend-python is on sys.path so `app` package can be imported when running from other cwd
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.core import config

def main():
    print('MONGO_URI=', config.MONGO_URI)
    print('DB=', config.MONGO_DB_NAME)
    db = config.db
    if db is None:
        print('db is None')
        return
    try:
        cnt = db.marketlists.count_documents({})
    except Exception as e:
        print('count error', e)
        cnt = None
    print('marketlists_count=', cnt)
    try:
        sample = db.marketlists.find_one({}, {'ticker':1,'displayTicker':1,'companyName':1})
    except Exception as e:
        sample = f'find_one error: {e}'
    print('sample=', sample)

if __name__ == '__main__':
    main()
