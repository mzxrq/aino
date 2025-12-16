import sys
sys.path.extend(['backend-python', 'backend-python/app'])
from app.services.train_service import load_dataset, data_preprocessing
from sklearn.ensemble import IsolationForest
import numpy as np

ticker = "5253.T"
df = load_dataset([ticker], period="3mo", interval="1d")
df = data_preprocessing(df)

features = ['return_1', 'return_3', 'return_6', 'zscore_20', 'ATR_14','bb_width', 'RSI', 'MACD', 'MACD_hist', 'VWAP', 'body','upper_wick', 'lower_wick', 'wick_ratio']
X = df[features].dropna()

print(f"X shape: {X.shape}")
print(f"Features present: {len(X.columns)}/{len(features)}")

# Test IsolationForest directly
model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
model.fit(X)
predictions = model.predict(X)
scores = model.score_samples(X)

n_anomalies = (predictions == -1).sum()
print(f"\nIsolationForest results:")
print(f"  Predicted anomalies: {n_anomalies}")
print(f"  Score range: {scores.min():.4f} to {scores.max():.4f}")
print(f"  Score mean: {scores.mean():.4f}")

# Check if any NaN in features
print(f"\nFeature NaN counts:")
for col in X.columns:
    nans = X[col].isna().sum()
    if nans > 0:
        print(f"  {col}: {nans}")

# Try lower contamination
print(f"\nTrying contamination=0.10:")
model2 = IsolationForest(n_estimators=100, contamination=0.10, random_state=42)
model2.fit(X)
preds2 = model2.predict(X)
print(f"  Predicted anomalies: {(preds2 == -1).sum()}")
