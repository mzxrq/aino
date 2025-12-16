import sys
sys.path.insert(0, '.')
from backend_python.app.services.train_service import load_dataset, data_preprocessing
import pandas as pd

# Test load_dataset directly
print("Testing load_dataset with 1y/1d:")
df = load_dataset(['5253.T'], period='1y', interval='1d')
print(f"After load_dataset: {len(df)} rows")
if len(df) > 0:
    if 'Datetime' in df.columns:
        dt = pd.to_datetime(df['Datetime'])
        print(f"Date range: {dt.min()} to {dt.max()}")
    print(f"Columns: {df.columns.tolist()}")

print("\nTesting data_preprocessing:")
df_processed = data_preprocessing(df)
print(f"After preprocessing: {len(df_processed)} rows")
if len(df_processed) > 0 and 'Datetime' in df_processed.columns:
    dt = pd.to_datetime(df_processed['Datetime'])
    print(f"Date range: {dt.min()} to {dt.max()}")
