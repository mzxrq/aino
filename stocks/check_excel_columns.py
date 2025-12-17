#!/usr/bin/env python3
"""Quick check of Excel file columns"""
import pandas as pd

print("\n=== JP Market (data_e.xls) ===")
try:
    df_jp = pd.read_excel('stocks/data_e.xls', sheet_name=0)
    print(f"Columns: {list(df_jp.columns)}")
    print(f"Total rows: {len(df_jp)}")
    print(f"Sample data:\n{df_jp.head(2)}")
except Exception as e:
    print(f"Error: {e}")

print("\n=== TH Market (listedCompanies_en_US.xls) ===")
try:
    df_th = pd.read_excel('stocks/listedCompanies_en_US.xls', sheet_name=0)
    print(f"Columns: {list(df_th.columns)}")
    print(f"Total rows: {len(df_th)}")
    print(f"Sample data:\n{df_th.head(2)}")
except Exception as e:
    print(f"Error: {e}")
