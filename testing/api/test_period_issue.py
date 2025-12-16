import yfinance as yf
import pandas as pd

# Test multiple tickers
tickers = ['5253.T', '5352.T', 'AAPL', 'MSFT', '9984.T', '1540.BK']

for ticker in tickers:
    try:
        print(f'\n{ticker}:')
        df = yf.download(ticker, period='1y', interval='1d', progress=False)
        if df is not None and len(df) > 0:
            date_range = df.index.max() - df.index.min()
            print(f'  Rows: {len(df)}, Span: {date_range.days} days')
            print(f'  Date range: {df.index.min()} to {df.index.max()}')
        else:
            print(f'  No data')
    except Exception as e:
        print(f'  Error: {str(e)[:60]}')
