import sys
sys.path.extend(['backend-python', 'backend-python/app'])
from app.services.train_service import detect_anomalies_adaptive, load_dataset, data_preprocessing, get_adaptive_contamination
from app.core.config import logger

ticker = "5253.T"
print(f"\n=== Testing anomaly detection for {ticker} ===\n")

# Load and preprocess data
df = load_dataset([ticker], period="3mo", interval="1d")
print(f"1. Loaded {len(df)} rows")

if df.empty:
    print("No data loaded!")
    sys.exit(1)

df = data_preprocessing(df)
print(f"2. After preprocessing: {len(df)} rows")

if df.empty:
    print("Empty after preprocessing!")
    sys.exit(1)

# Check volatility and contamination
contamination = get_adaptive_contamination(df, ticker)
print(f"3. Adaptive contamination: {contamination:.4f}")

# Try adaptive detection
try:
    anomalies = detect_anomalies_adaptive(ticker, period="3mo", interval="1d")
    print(f"4. Detected {len(anomalies)} anomalies")
    if not anomalies.empty:
        print("\n   Anomalies found:")
        for _, row in anomalies.iterrows():
            print(f"     {row.get('Datetime')}: {row.get('Close')}")
except Exception as e:
    print(f"4. ERROR: {e}")
    import traceback
    traceback.print_exc()

# Check DB
from app.core.config import db
if db is not None:
    saved = db.anomalies.count_documents({"Ticker": ticker})
    print(f"\n5. Saved to DB: {saved} anomalies")
