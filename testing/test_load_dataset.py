import sys
sys.path.insert(0, '.')

from backend_python.app.services.train_service import load_dataset
import pandas as pd

# Test load_dataset with 1y/1d
print("Testing load_dataset with 1y/1d...")
df = load_dataset(['5253.T'], period='1y', interval='1d')

if df is not None and len(df) > 0:
    print(f"Rows: {len(df)}")
    if 'Datetime' in df.columns:
        dt = pd.to_datetime(df['Datetime'])
        print(f"Date range: {dt.min()} to {dt.max()}")
        delta = dt.max() - dt.min()
        print(f"Span: {delta.days} days")
else:
    print("No data returned")
