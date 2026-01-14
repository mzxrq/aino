#!/usr/bin/env python3
"""
Build comprehensive marketlists from JP/TH Excel files and US GitHub repo
Stores tickers in dual format:
- ticker: For yfinance/internal use (with .T, .BK suffixes)
- displayTicker: For display (without suffixes)
"""
import os
import re
import json
import pandas as pd
import yfinance as yf
try:
    from unidecode import unidecode as _unidecode
except Exception:
    _unidecode = None
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv
import time
from datetime import datetime

# Load environment variables
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/stock_anomaly_db")


def normalize_name_and_asset(name, default_asset="stock"):
    """Standardize companyName and derive assetType from common suffix phrases."""
    if not name:
        return "", default_asset

    cleaned = str(name)
    asset = default_asset
    lower = cleaned.lower()

    if "exchange traded fund" in lower:
        asset = "etf"
    elif "listed index fund" in lower:
        asset = "funds"
    elif "warrant" in lower:
        asset = "warrant"
    elif "american depositary share" in lower or "american depository share" in lower or "ordinary share" in lower:
        asset = "shares"

    patterns = [
        (r"(?i)\bclass\s+a\s+common\s+stock\b", "Class A"),
        (r"(?i)\bclass\s+b\s+common\s+stock\b", "Class B"),
        (r"(?i)\bcommon\s+stock\b", "")
    ]
    for pat, repl in patterns:
        cleaned = re.sub(pat, repl, cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned, asset

def _safe_read(path):
    """Read Excel or CSV into a DataFrame with common encoding fallbacks."""
    if path.lower().endswith('.csv'):
        try:
            return pd.read_csv(path, dtype=str, encoding='utf-8')
        except Exception:
            return pd.read_csv(path, dtype=str, encoding='cp1252')
    elif path.lower().endswith('.xls'):
        # .xls files from websites are often HTML/XML format, not binary Excel
        try:
            return pd.read_excel(path, sheet_name=0, engine='xlrd')
        except Exception:
            try:
                # Try openpyxl (works for XML-based Excel formats)
                return pd.read_excel(path, sheet_name=0, engine='openpyxl')
            except Exception:
                # Last resort: try reading as HTML table
                return pd.read_html(path, dtype=str)[0]
    elif path.lower().endswith('.xlsx'):
        return pd.read_excel(path, sheet_name=0, engine='openpyxl')
    else:
        # fallback - let pandas auto-detect
        return pd.read_excel(path, sheet_name=0)


def parse_jp_market():
    """Parse Japanese market by merging English (data_e.*) and local (data_j.*) sources."""
    print("\n📊 Parsing JP market (data_e.* + data_j.*)...")

    english_paths = [
        "data/data_e.xlsx",
        "stocks/data/data_e.xlsx",
        "data/data_e.xls",
        "stocks/data/data_e.xls",
        "data/data_e.csv",
        "stocks/data/data_e.csv",
    ]
    local_paths = [
        "data/data_j.csv",
        "stocks/data/data_j.csv",
        "data/data_j.xls",
        "stocks/data/data_j.xls",
        "data/data_j.xlsx",
        "stocks/data/data_j.xlsx",
    ]

    english_file = next((p for p in english_paths if os.path.exists(p)), None)
    local_file = next((p for p in local_paths if os.path.exists(p)), None)

    if not english_file and not local_file:
        print(f"⚠️  JP market files not found. Checked: {english_paths + local_paths}")
        return []

    # Load dataframes if present
    english_df = _safe_read(english_file) if english_file else None
    local_df = _safe_read(local_file) if local_file else None

    if english_df is not None:
        print(f"   Found English file: {english_file}")
        print(f"   Available columns (EN): {list(english_df.columns)}")
    if local_df is not None:
        print(f"   Found Local file: {local_file}")
        print(f"   Available columns (Local): {list(local_df.columns)}")

    # Column candidates
    ticker_cols = ['Local Code', 'コード', 'Code', 'コード（証券コード）', 'Code ']  # generous set
    en_name_cols = ['Name (English)', 'Name', 'Company', 'Company Name', 'Name (EN)']
    local_name_cols = ['銘柄名', 'Name (Local)', 'Local Name', 'Name (Local)']
    sector_cols = ['33 Sector(name)', '17 Sector(name)', '33業種区分', '17業種区分', 'Section/Products']
    type_cols = ['Asset Type', 'Type', 'Category', 'Product Type', 'Classification', 'Market Segment']

    # Optional contact columns (safe defaults)
    address_cols = ['Address', 'address', 'address1', '所在地', '本社所在地']
    postal_cols = ['Postal Code', 'Postal', 'zip', 'Zip', '郵便番号']
    phone_cols = ['Phone', 'Telephone', '電話', '電話番号']
    fax_cols = ['Fax', 'FaxNumber', 'โทรสาร', 'โทรสาร']
    website_cols = ['Website', 'website', 'URL', 'WebsiteUrl', 'website_url']

    # Build a map of local names by ticker from local_df (if available)
    local_names = {}
    local_addresses = {}
    local_phones = {}
    local_postals = {}
    local_faxes = {}
    local_websites = {}

    def _norm_ticker(raw):
        if not raw or str(raw).strip().lower() == 'nan':
            return None
        t = str(raw).strip()
        return t.replace('.T', '').replace('.JP', '')

    if local_df is not None:
        # Find candidate columns in local_df
        local_tcol = next((c for c in ticker_cols if c in local_df.columns), None)
        local_ncol = next((c for c in local_name_cols if c in local_df.columns), None)
        local_addr_col = next((c for c in address_cols if c in local_df.columns), None)
        local_postal_col = next((c for c in postal_cols if c in local_df.columns), None)
        local_phone_col = next((c for c in phone_cols if c in local_df.columns), None)
        local_fax_col = next((c for c in fax_cols if c in local_df.columns), None)
        local_website_col = next((c for c in website_cols if c in local_df.columns), None)

        if local_tcol:
            for _, r in local_df.iterrows():
                raw = r.get(local_tcol)
                code = _norm_ticker(raw)
                if not code:
                    continue
                if local_ncol:
                    local_names[code] = str(r.get(local_ncol) or '').strip()
                if local_addr_col:
                    local_addresses[code] = str(r.get(local_addr_col) or '').strip()
                if local_phone_col:
                    local_phones[code] = str(r.get(local_phone_col) or '').strip()
                if local_postal_col:
                    local_postals[code] = str(r.get(local_postal_col) or '').strip()
                if local_fax_col:
                    local_faxes[code] = str(r.get(local_fax_col) or '').strip()
                if local_website_col:
                    local_websites[code] = str(r.get(local_website_col) or '').strip()

    results = []
    etf_count = 0
    stock_count = 0

    # If english_df exists iterate it for canonical rows, else fall back to local_df
    source_df = english_df if english_df is not None else local_df

    # Determine columns in source
    source_tcol = next((c for c in ticker_cols if c in source_df.columns), None)
    source_name_col = next((c for c in en_name_cols if c in source_df.columns), None) if english_df is not None else next((c for c in local_name_cols if c in source_df.columns), None)
    sector_col = next((c for c in sector_cols if c in source_df.columns), None)
    type_col = next((c for c in type_cols if c in source_df.columns), None)

    if not source_tcol:
        print(f"❌ Could not find ticker column in JP source files")
        return []

    for _, row in source_df.iterrows():
        raw = row.get(source_tcol)
        ticker_clean = _norm_ticker(raw)
        if not ticker_clean:
            continue
        ticker = f"{ticker_clean}.T"
        display_ticker = ticker_clean

        # English name (if english_df present)
        company_name_en = str(row.get(source_name_col, '')).strip() if source_name_col else ''
        # local name from local_names map, fallback to english if missing
        company_name_local = local_names.get(ticker_clean, company_name_en or ticker_clean)

        sector = str(row.get(sector_col, '')).strip() if sector_col else ''

        asset_type = 'stock'
        if type_col:
            type_value = str(row.get(type_col, '')).strip().lower()
            if 'etf' in type_value:
                asset_type = 'etf'
                etf_count += 1
            else:
                stock_count += 1
        else:
            if 'etf' in (company_name_en or company_name_local).lower():
                asset_type = 'etf'
                etf_count += 1
            else:
                stock_count += 1

        # prefer English for display, store local separately
        company_name_display = company_name_en or company_name_local
        company_name_display, asset_type = normalize_name_and_asset(company_name_display.strip(), asset_type)
        company_name_local = company_name_local.strip()

        results.append({
            'ticker': ticker,
            'displayTicker': display_ticker,
            'companyName': company_name_display,
            'companyNameLocal': company_name_local,
            'companyAddress': local_addresses.get(ticker_clean, ''),
            'postalCode': local_postals.get(ticker_clean, ''),
            'companyPhone': local_phones.get(ticker_clean, ''),
            'companyFax': local_faxes.get(ticker_clean, ''),
            'companyWebsite': local_websites.get(ticker_clean, ''),
            'country': 'JP',
            'primaryExchange': 'TSE',
            'sectorGroup': sector,
            'assetType': asset_type,
            'status': 'active'
        })

    print(f"✅ Parsed {len(results)} JP items ({stock_count} stocks + {etf_count} ETFs)")
    return results

def parse_jp_etfs():
    """Deprecated - JP ETFs are now parsed from the Excel file automatically"""
    return []

def parse_th_market():
    """Parse Thai market by merging English (listedCompanies_en_US.*) and Thai (listedCompanies_th_TH.*) sources."""
    print("\n📊 Parsing TH market (listedCompanies en_US + th_TH)...")

    en_paths = [
        "stocks/data/listedCompanies_en_US.xls",
        "stocks/data/listedCompanies_en_US.xlsx",
        "data/listedCompanies_en_US.xls",
        "data/listedCompanies_en_US.xlsx",
    ]
    local_paths = [
        "stocks/data/listedCompanies_th_TH.csv",
        "stocks/data/listedCompanies_th_TH.xls",
        "stocks/data/listedCompanies_th_TH.xlsx",
        "data/listedCompanies_th_TH.csv",
        "data/listedCompanies_th_TH.xls",
        "data/listedCompanies_th_TH.xlsx",
    ]

    en_file = next((p for p in en_paths if os.path.exists(p)), None)
    local_file = next((p for p in local_paths if os.path.exists(p)), None)

    if not en_file and not local_file:
        print(f"⚠️  TH market files not found. Checked: {en_paths + local_paths}")
        return []

    en_df = _safe_read(en_file) if en_file else None
    local_df = _safe_read(local_file) if local_file else None

    if en_df is not None:
        print(f"   Found English file: {en_file}")
        print(f"   Available columns (EN): {list(en_df.columns)}")
    if local_df is not None:
        print(f"   Found Local file: {local_file}")
        print(f"   Available columns (Local): {list(local_df.columns)}")

    # Candidate columns
    ticker_cols = ['Symbol', 'หลักทรัพย์', 'Ticker']
    name_cols = ['Company', 'บริษัท', 'Company Name']
    sector_cols = ['Sector', 'กลุ่มอุตสาหกรรม', 'หมวดธุรกิจ']
    address_cols = ['ที่อยู่', 'Address', 'address', 'Address1']
    postal_cols = ['รหัสไปรษณีย์', 'Postal Code', 'zip', 'Zip']
    phone_cols = ['โทรศัพท์', 'Phone', 'Telephone']
    fax_cols = ['โทรสาร', 'Fax']
    website_cols = ['เว็บไซต์', 'Website', 'website', 'URL']

    # Build local map from Thai CSV if present
    local_names = {}
    local_addresses = {}
    local_phones = {}
    local_postals = {}
    local_faxes = {}
    local_websites = {}

    def _norm_ticker(raw):
        if not raw or str(raw).strip().lower() == 'nan':
            return None
        t = str(raw).strip()
        return t.replace('.BK', '').replace('.TH', '')

    if local_df is not None:
        local_tcol = next((c for c in ticker_cols if c in local_df.columns), None)
        local_ncol = next((c for c in name_cols if c in local_df.columns), None)
        local_addr_col = next((c for c in address_cols if c in local_df.columns), None)
        local_postal_col = next((c for c in postal_cols if c in local_df.columns), None)
        local_phone_col = next((c for c in phone_cols if c in local_df.columns), None)
        local_fax_col = next((c for c in fax_cols if c in local_df.columns), None)
        local_website_col = next((c for c in website_cols if c in local_df.columns), None)

        if local_tcol:
            for _, r in local_df.iterrows():
                raw = r.get(local_tcol)
                code = _norm_ticker(raw)
                if not code:
                    continue
                if local_ncol:
                    local_names[code] = str(r.get(local_ncol) or '').strip()
                if local_addr_col:
                    local_addresses[code] = str(r.get(local_addr_col) or '').strip()
                if local_phone_col:
                    local_phones[code] = str(r.get(local_phone_col) or '').strip()
                if local_postal_col:
                    local_postals[code] = str(r.get(local_postal_col) or '').strip()
                if local_fax_col:
                    local_faxes[code] = str(r.get(local_fax_col) or '').strip()
                if local_website_col:
                    local_websites[code] = str(r.get(local_website_col) or '').strip()

    # Source rows from en_df if available else local_df
    source_df = en_df if en_df is not None else local_df
    source_tcol = next((c for c in ticker_cols if c in source_df.columns), None)
    source_name_col = next((c for c in name_cols if c in source_df.columns), None)
    source_sector_col = next((c for c in sector_cols if c in source_df.columns), None)

    if not source_tcol:
        print(f"❌ Could not find ticker column in TH source files")
        return []

    results = []
    for _, row in source_df.iterrows():
        raw = row.get(source_tcol)
        ticker_clean = _norm_ticker(raw)
        if not ticker_clean:
            continue
        ticker = f"{ticker_clean}.BK"
        display_ticker = ticker_clean

        company_name_en = str(row.get(source_name_col, '')).strip() if source_name_col else ''
        company_name_local = local_names.get(ticker_clean, company_name_en or ticker_clean)
        sector = str(row.get(source_sector_col, '')).strip() if source_sector_col else ''

        company_address = local_addresses.get(ticker_clean, '')
        company_postal = local_postals.get(ticker_clean, '')
        company_phone = local_phones.get(ticker_clean, '')
        company_fax = local_faxes.get(ticker_clean, '')
        company_website = local_websites.get(ticker_clean, '')

        company_name_display, asset_type = normalize_name_and_asset(company_name_local.strip() or company_name_en.strip() or ticker_clean, 'stock')
        company_name_local = company_name_local.strip()

        results.append({
            "ticker": ticker,
            "displayTicker": display_ticker,
            "companyName": company_name_display,
            "companyNameLocal": company_name_local,
            "companyAddress": company_address,
            "postalCode": company_postal,
            "companyPhone": company_phone,
            "companyFax": company_fax,
            "companyWebsite": company_website,
            "country": "TH",
            "primaryExchange": "SET",
            "sectorGroup": sector.strip(),
            "assetType": asset_type,
            "status": "active"
        })

    print(f"✅ Parsed {len(results)} TH stocks")
    return results

def parse_th_etfs():
    """Parse Thai ETFs manually from known list"""
    print("\n📊 Parsing TH ETFs (manual list)...")
    
    # Known Thai ETFs - researched list
    thai_etfs = [
        {"ticker": "TDEX.BK", "name": "Thai Equity Dividend ETF"},
        {"ticker": "1DIV.BK", "name": "First Thai Dividend ETF"},
        {"ticker": "BMSCITH.BK", "name": "BM Thai Infrastructure ETF"},
        {"ticker": "BSET100.BK", "name": "BM SET50 ETF"},
        {"ticker": "GLD.BK", "name": "Commodity Gold ETF"},
        {"ticker": "CHINA.BK", "name": "China Large Cap Equity ETF"},
        {"ticker": "BMSCG.BK", "name": "BM Bangkok Small Cap Growth ETF"},
        {"ticker": "ABFTH.BK", "name": "Amanah Sri Saham Thailand ETF"},
        {"ticker": "ENGY.BK", "name": "Energy Sector ETF"},
        {"ticker": "UBOT.BK", "name": "Thai Robotics & Automation ETF"},
        {"ticker": "UHERO.BK", "name": "Thai Healthcare ETF"}
    ]
    
    results = []
    for etf in thai_etfs:
        results.append({
            "ticker": etf["ticker"],
            "displayTicker": etf["ticker"].replace(".BK", ""),
            "companyName": etf["name"],
            "country": "TH",
            "primaryExchange": "SET",
            "sectorGroup": "ETF",
            "assetType": "etf",
            "status": "active"
        })
    
    print(f"✅ Parsed {len(results)} TH ETFs")
    return results

def parse_us_market():
    """Parse US market using correct GitHub repo URLs for full ticker data"""
    print("\n📊 Parsing US market (fetching from GitHub)...")
    
    import urllib.request
    
    results = []
    
    # GitHub raw URLs for full ticker data (includes name, sector, industry)
    exchanges = [
        ("https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json", "NASDAQ"),
        ("https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json", "NYSE"),
        ("https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json", "AMEX")
    ]
    
    for url, exchange_name in exchanges:
        try:
            print(f"📥 Fetching {exchange_name} from GitHub...", end=" ")
            
            with urllib.request.urlopen(url, timeout=30) as response:
                data = json.loads(response.read().decode('utf-8'))
            
            # Handle both array and single object formats
            if not isinstance(data, list):
                data = [data]
            
            for item in data:
                ticker = item.get("symbol", item.get("Ticker", "")).strip()
                if not ticker:
                    continue
                
                name = item.get("name", item.get("Name", ticker))
                sector = item.get("sector", item.get("Sector", ""))
                industry = item.get("industry", item.get("Industry", ""))
                
                # Combine sector and industry if available
                sector_group = sector
                if industry and sector and industry != sector:
                    sector_group = f"{sector} - {industry}"
                elif industry:
                    sector_group = industry
                
                name_clean, asset_type = normalize_name_and_asset(name.strip(), "stock")

                results.append({
                    "ticker": ticker,
                    "displayTicker": ticker,  # US tickers don't need suffixes
                    "companyName": name_clean,
                    "country": "US",
                    "primaryExchange": exchange_name,
                    "sectorGroup": sector_group.strip(),
                    "assetType": asset_type,
                    "status": "active"
                })
            
            print(f"✅ {len(data)} entries")
        
        except Exception as e:
            print(f"❌ Error: {str(e)[:50]}")
            continue
    
    print(f"✅ Total US stocks parsed: {len(results)}")
    return results

def parse_us_etfs():
    """Parse US ETFs from GitHub (using nasdaq_full_tickers for reference)"""
    print("\n📊 Parsing US ETFs (fetching from GitHub)...")
    
    import urllib.request
    
    results = []
    
    # US ETFs list from GitHub
    etf_url = "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/etfs/etf_list.json"
    
    try:
        print(f"📥 Fetching ETF list from GitHub...", end=" ")
        
        with urllib.request.urlopen(etf_url, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        if not isinstance(data, list):
            data = [data]
        
        for item in data:
            ticker = item.get("symbol", item.get("Ticker", "")).strip()
            if not ticker:
                continue
            
            name = item.get("name", item.get("Name", ticker))
            sector = item.get("sector", item.get("Sector", ""))
            
            name_clean, asset_type = normalize_name_and_asset(name.strip(), "etf")

            results.append({
                "ticker": ticker,
                "displayTicker": ticker,
                "companyName": name_clean,
                "country": "US",
                "primaryExchange": "ETF",
                "sectorGroup": sector.strip() if sector else "ETF",
                "assetType": asset_type,
                "status": "active"
            })
        
        print(f"✅ {len(results)} ETFs")
    
    except Exception as e:
        print(f"⚠️  ETF list not available: {str(e)[:50]}")
        print("   Note: ETF data is optional, stocks will still be imported")
    
    return results

def enrich_with_yfinance(tickers, sample_size=10):
    """
    Enrich sample tickers with yfinance data to demonstrate capability
    Only fetches for a sample to avoid rate limiting
    """
    print(f"\n🔍 Enriching {sample_size} sample tickers with yfinance data...")
    
    enriched = []
    for i, ticker_data in enumerate(tickers[:sample_size]):
        ticker = ticker_data["ticker"]
        print(f"  [{i+1}/{sample_size}] Fetching {ticker}...", end=" ")
        
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            
            # Enrich with yfinance data
            ticker_data["yfinance"] = {
                "marketCap": info.get("marketCap"),
                "currency": info.get("currency"),
                "industry": info.get("industry"),
                "sector": info.get("sector"),
                "website": info.get("website"),
                "description": info.get("longBusinessSummary"),
                "employees": info.get("fullTimeEmployees"),
                "fetched_at": datetime.utcnow().isoformat()
            }

            # Merge top-level contact fields only when missing
            try:
                # Website
                existing_site = (ticker_data.get('companyWebsite') or '').strip()
                yf_site = info.get('website') or info.get('websiteUrl') or info.get('url') or ''
                if (not existing_site) and yf_site:
                    ticker_data['companyWebsite'] = yf_site

                # Phone
                existing_phone = (ticker_data.get('companyPhone') or '').strip()
                yf_phone = info.get('phone') or info.get('telephone') or ''
                if (not existing_phone) and yf_phone:
                    ticker_data['companyPhone'] = yf_phone

                # Address
                existing_addr = (ticker_data.get('companyAddress') or '').strip()
                # prefer address1/longBusinessSummary address-like fields
                yf_addr = info.get('address1') or info.get('address') or info.get('businessAddress') or ''
                if (not existing_addr) and yf_addr:
                    ticker_data['companyAddress'] = yf_addr

                # Postal / zip
                existing_postal = (ticker_data.get('postalCode') or '').strip()
                yf_postal = info.get('zip') or info.get('postalCode') or info.get('postal_code') or ''
                if (not existing_postal) and yf_postal:
                    ticker_data['postalCode'] = yf_postal
            except Exception:
                pass
            
            print("✅")
            time.sleep(0.5)  # Rate limiting
        
        except Exception as e:
            print(f"❌ {str(e)[:50]}")
        
        enriched.append(ticker_data)
    
    return enriched


def load_backup(file_path):
    """Load backup marketlist JSON if available."""
    if not os.path.exists(file_path):
        print(f"⚠️  Backup file {file_path} not found")
        return []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            print(f"⚠️  Backup file {file_path} is not a list, ignoring")
            return []
        print(f"✅ Loaded {len(data)} entries from backup")
        return data
    except Exception as e:
        print(f"❌ Failed to load backup {file_path}: {e}")
        return []

def import_to_mongodb(tickers):
    """Import tickers to MongoDB marketlists collection"""
    print(f"\n💾 Importing {len(tickers)} items to MongoDB...")
    
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    collection = db["marketlists"]
    
    operations = []
    for ticker_data in tickers:
        operations.append(
            UpdateOne(
                {"ticker": ticker_data["ticker"]},
                {"$set": ticker_data},
                upsert=True
            )
        )
    
    if not operations:
        print("⚠️  No tickers to import")
        return
    
    result = collection.bulk_write(operations)
    
    print(f"✅ Import complete!")
    print(f"   • Inserted: {result.upserted_count}")
    print(f"   • Modified: {result.modified_count}")
    print(f"   • Matched: {result.matched_count}")
    
    total = collection.count_documents({})
    print(f"📈 Total items in marketlists: {total}")
    
    # Show breakdown by type and country
    print("\n📊 Database Breakdown:")
    for country in ["US", "JP", "TH"]:
        stocks = collection.count_documents({"country": country, "assetType": "stock"})
        etfs = collection.count_documents({"country": country, "assetType": "etf"})
        total_country = collection.count_documents({"country": country})
        print(f"   • {country}: {stocks} stocks + {etfs} ETFs = {total_country} total")
    
    client.close()

def main():
    """Main execution"""
    print("=" * 20)
    print("🚀 Building Comprehensive MarketLists")
    print("=" * 20)
    
    all_tickers = []
    
    # Parse all markets (JP/TH parsing includes ETFs if available in Excel)
    jp_tickers = parse_jp_market()
    th_tickers = parse_th_market()
    th_etfs = parse_th_etfs()
    us_tickers = parse_us_market()
    us_etfs = parse_us_etfs()
    
    # Combine all data
    all_tickers.extend(jp_tickers)
    all_tickers.extend(th_tickers)
    all_tickers.extend(th_etfs)
    all_tickers.extend(us_tickers)
    all_tickers.extend(us_etfs)

    # backup_path = "stocks/json/marketlists_backup.json"
    # if os.path.exists(backup_path):
    #     use_backup = input(f"\n📂 Merge missing tickers from backup {backup_path}? (y/N): ").strip().lower() == "y"
    #     if use_backup:
    #         backup_items = load_backup(backup_path)
    #         if backup_items:
    #             existing = {t["ticker"]: t for t in all_tickers}
    #             added = 0
    #             for item in backup_items:
    #                 tic = item.get("ticker")
    #                 if not tic or tic in existing:
    #                     continue
    #                 name_clean, asset_type = normalize_name_and_asset(item.get("companyName"), item.get("assetType", "stock"))
    #                 item["companyName"] = name_clean
    #                 item["assetType"] = asset_type
    #                 existing[tic] = item
    #                 added += 1
    #             all_tickers = list(existing.values())
    #             print(f"✅ Added {added} tickers from backup")
    
    # Breakdown by asset type and country
    print("\n📊 Breakdown by type and country:")
    for country in ["US", "JP", "TH"]:
        stocks = [t for t in all_tickers if t.get("country") == country and t.get("assetType") == "stock"]
        etfs = [t for t in all_tickers if t.get("country") == country and t.get("assetType") == "etf"]
        print(f"   • {country}: {len(stocks)} stocks + {len(etfs)} ETFs = {len(stocks) + len(etfs)} total")
    
    print(f"\n📊 Total items parsed: {len(all_tickers)}")
    
    if not all_tickers:
        print("❌ No tickers found to import")
        return
    
    # Optional: Enrich with yfinance (only sample to avoid rate limits)
    enrich = input("\n🔍 Enrich sample tickers with yfinance? (y/N): ").strip().lower()
    if enrich == 'y':
        sample_size = int(input("How many samples? (default 10): ") or "10")
        enrich_with_yfinance(all_tickers, sample_size)
    
    # Import to MongoDB
    import_to_mongodb(all_tickers)
    
    # Save to JSON backup with timestamped filename (UTC)
    ts = datetime.utcnow().strftime("%y%m%d-%H%M")
    os.makedirs("stocks/json", exist_ok=True)
    backup_file = f"stocks/json/{ts} marketlists_backup.json"
    print(f"\n💾 Saving backup to {backup_file}...")
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(all_tickers, f, indent=2, ensure_ascii=False)
    print(f"✅ Backup saved!")

    print("\n" + "=" * 60)
    print("🎉 Done! Your marketlists collection is ready.")
    print(f"📈 Total: {len(all_tickers)} items (stocks + ETFs)")
    print("=" * 60)

if __name__ == "__main__":
    main()
