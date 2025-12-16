import yfinance as yf
import pandas as pd

tickers = ['9020.T', 'MSFT', '5253.T']
for ticker in tickers:
    df = yf.download(ticker, period='1y', interval='1d', progress=False)
    min_date = df.index.min().strftime("%Y-%m-%d")
    max_date = df.index.max().strftime("%Y-%m-%d")
    print(f'{ticker}: {len(df)} rows, from {min_date} to {max_date}')
