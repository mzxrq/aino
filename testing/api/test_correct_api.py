import requests
import json

BASE_URL = "http://localhost:5000"

tickers = ['9020.T', 'MSFT']
for ticker in tickers:
    url = f"{BASE_URL}/chart?ticker={ticker}&period=1y&interval=1d&nocache=1"
    try:
        resp = requests.get(url, timeout=60)
        data = resp.json()
        if ticker in data:
            dates = data[ticker].get('dates', [])
            print(f"{ticker}: {len(dates)} dates")
            if dates:
                print(f"  First: {dates[0]}")
                print(f"  Last: {dates[-1]}")
        else:
            print(f"{ticker}: Key not found in response")
    except Exception as e:
        print(f"{ticker}: Error - {e}")
