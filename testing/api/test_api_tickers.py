import requests

tickers = ['9020.T', 'MSFT', '5253.T']

for ticker in tickers:
    response = requests.get('http://localhost:5000/chart', params={'ticker': ticker, 'period': '1y', 'interval': '1d', 'nocache': 1})
    if response.status_code == 200:
        data = response.json()
        ticker_data = data.get(ticker, {})
        dates = ticker_data.get('dates', [])
        first = dates[0][:10] if dates else 'N/A'
        last = dates[-1][:10] if dates else 'N/A'
        print(f'{ticker}: {len(dates)} dates - {first} to {last}')
    else:
        print(f'{ticker}: Error {response.status_code}')
