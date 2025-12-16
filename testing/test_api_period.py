import requests
import json

# Test the API with 1y/1d
response = requests.get(
    "http://localhost:8000/py/chart",
    params={
        "ticker": "5253.T",
        "period": "1y",
        "interval": "1d"
    }
)

print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    ticker_data = data.get("5253.T", {})
    dates = ticker_data.get("dates", [])
    print(f"Dates: {len(dates)}")
    if dates:
        print(f"First: {dates[0]}")
        print(f"Last: {dates[-1]}")
else:
    print(f"Response: {response.text[:200]}")
