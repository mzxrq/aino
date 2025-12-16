import requests

test_cases = [
    ('5253.T', '1y', '1d'),
    ('5253.T', '1mo', '30m'),
    ('5253.T', '6mo', '1d'),
    ('AAPL', '1y', '1d'),
]

for ticker, period, interval in test_cases:
    response = requests.get('http://localhost:5000/chart', params={'ticker': ticker, 'period': period, 'interval': interval})
    if response.status_code == 200:
        data = response.json()
        ticker_data = data.get(ticker, {})
        dates = ticker_data.get('dates', [])
        print(f"{ticker} {period}/{interval}: {len(dates)} dates - {dates[0] if dates else 'N/A'} to {dates[-1] if dates else 'N/A'}")
    else:
        print(f"{ticker} {period}/{interval}: ERROR {response.status_code}")
