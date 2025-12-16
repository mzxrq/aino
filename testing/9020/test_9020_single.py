import requests
import json

BASE_URL = "http://localhost:5000"

tickers = ['9020.T']
for ticker in tickers:
    url = f"{BASE_URL}/chart?ticker={ticker}&period=1y&interval=1d&nocache=1"
    print(f"Requesting: {url}")
    try:
        resp = requests.get(url, timeout=60)  # 60 second timeout
        if resp.status_code == 200:
            data = resp.json()
            dates = data.get('dates', [])
            print(f"{ticker}: {len(dates)} dates")
            if dates:
                print(f"  First: {dates[0]}")
                print(f"  Last: {dates[-1]}")
        else:
            print(f"{ticker}: HTTP {resp.status_code}")
            print(f"Response: {resp.text[:200]}")
    except Exception as e:
        print(f"{ticker}: Error - {e}")
