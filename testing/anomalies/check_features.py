import sys
sys.path.extend(['backend-python', 'backend-python/app'])
from app.services.train_service import load_dataset, data_preprocessing
import numpy as np

ticker = "5253.T"
df = load_dataset([ticker], period="3mo", interval="1d")
print(f"Loaded {len(df)} rows")

df = data_preprocessing(df)
print(f"After preprocessing: {len(df)} rows\n")

# Check feature variance
features = ['return_1', 'return_3', 'return_6', 'zscore_20', 'ATR_14','bb_width', 'RSI', 'MACD', 'MACD_hist', 'VWAP', 'body','upper_wick', 'lower_wick', 'wick_ratio']

X = df[features].dropna()
print(f"Feature matrix shape: {X.shape}")

for col in features:
    if col in X.columns:
        vals = X[col]
        print(f"{col:20} min={vals.min():.6f}  max={vals.max():.6f}  std={vals.std():.6f}  mean={vals.mean():.6f}")
