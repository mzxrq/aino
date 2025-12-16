import sys
sys.path.insert(0, 'app')
from services.train_service import load_dataset
import pandas as pd
import numpy as np

# Test load_dataset directly
print("Testing load_dataset with 1y/1d:")
df = load_dataset(['5253.T'], period='1y', interval='1d')
print(f"Rows: {len(df)}")

# Now manually trace through preprocessing to see where NaNs come from
df = df.dropna().reset_index(drop=True)
print(f"After initial dropna: {len(df)}")

# Preserve ticker
tickers = df["Ticker"].copy()

# Feature engineering
df["return_1"] = df["Close"].pct_change(1)
df["return_3"] = df["Close"].pct_change(3)
df["return_6"] = df["Close"].pct_change(6)

df["roll_mean_20"] = df["Close"].rolling(20, min_periods=1).mean()
df["roll_std_20"] = df["Close"].rolling(20, min_periods=1).std()

# Check NaNs at each step
print(f"After returns and rolling: {df.isna().sum().sum()} total NaNs")
print(f"  return_1: {df['return_1'].isna().sum()}")
print(f"  return_3: {df['return_3'].isna().sum()}")
print(f"  return_6: {df['return_6'].isna().sum()}")
print(f"  roll_mean_20: {df['roll_mean_20'].isna().sum()}")
print(f"  roll_std_20: {df['roll_std_20'].isna().sum()}")

# Now do the full preprocessing and see the final shape
df = df.dropna().reset_index(drop=True)
print(f"After final dropna: {len(df)} rows")
