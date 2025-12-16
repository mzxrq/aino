import requests
import json

BASE_URL = "http://localhost:5000"

ticker = '9020.T'
url = f"{BASE_URL}/chart?ticker={ticker}&period=1y&interval=1d&nocache=1"
print(f"Requesting: {url}")
try:
    resp = requests.get(url, timeout=60)
    print(f"Status: {resp.status_code}")
    print(f"Headers: {dict(resp.headers)}")
    data = resp.json()
    print(f"Response keys: {list(data.keys())}")
    print(f"Full response: {json.dumps(data, indent=2)[:500]}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
