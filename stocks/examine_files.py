import pandas as pd

print("=== Japanese Market (data_e.xls) ===")
df_jp = pd.read_excel('data_e.xls')
print(f"Shape: {df_jp.shape}")
print(f"Columns: {list(df_jp.columns)}")
print(df_jp.head(3))

print("\n=== Thai Market (listedCompanies_en_US.xls) ===")
try:
    df_th = pd.read_excel('listedCompanies_en_US.xls', engine='xlrd')
except:
    df_th = pd.read_excel('listedCompanies_en_US.xls', engine='openpyxl')
print(f"Shape: {df_th.shape}")
print(f"Columns: {list(df_th.columns)}")
print(df_th.head(3))
