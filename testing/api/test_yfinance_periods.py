import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

# Test a wider range of tickers to see if any have issues with 1y/1d
tickers = [
    # Japanese tickers
    '5253.T', '5352.T', '9984.T', '6758.T', '8001.T',
    # Thai tickers (may not work)
    # '1540.BK',
    # US tickers
    'AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA'
]

print("Testing 1y/1d period for various tickers:")
print(f"{'Ticker':<12} {'Rows':<8} {'Span (days)':<15} {'Approx Months':<15}")
print("-" * 50)

for ticker in tickers:
    try:
        df = yf.download(ticker, period='1y', interval='1d', progress=False)
        if df is not None and len(df) > 0:
            date_range = df.index.max() - df.index.min()
            months_approx = date_range.days / 30.0
            print(f"{ticker:<12} {len(df):<8} {date_range.days:<15} {months_approx:<15.1f}")
        else:
            print(f"{ticker:<12} No data")
    except Exception as e:
        print(f"{ticker:<12} Error: {str(e)[:40]}")
