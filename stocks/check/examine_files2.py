import pandas as pd
import io
from html.parser import HTMLParser

print("=== Japanese Market (data_e.xls) ===")
df_jp = pd.read_excel('data_e.xls')
print(f"Shape: {df_jp.shape}")
print(f"Columns: {list(df_jp.columns)}")
print("Sample rows:")
print(df_jp[['Local Code', 'Name (English)']].head(3))

print("\n=== Thai Market (listedCompanies_en_US.xls) ===")
try:
    # Try reading as HTML table
    df_th = pd.read_html('listedCompanies_en_US.xls')[0]
    print(f"Shape: {df_th.shape}")
    print(f"Columns: {list(df_th.columns)}")
    print("Sample rows:")
    print(df_th.head(3))
except Exception as e:
    print(f"Error: {e}")
    # Try direct read_excel with HTML engine
    try:
        df_th = pd.read_excel('listedCompanies_en_US.xls')
        print(f"Shape: {df_th.shape}")
        print(f"Columns: {list(df_th.columns)}")
    except Exception as e2:
        print(f"Second attempt error: {e2}")
