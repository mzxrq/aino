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

def parse_jp_market():
    """Parse Japanese market from data_e.xlsx - separates stocks and ETFs"""
    print("\n📊 Parsing JP market (data_e.xlsx)...")
    
    # Try multiple paths (run from root or stocks/ directory)
    possible_paths = [
        "data/data_e.xlsx",
        "stocks/data/data_e.xlsx",
        "data/data_e.xls",
        "stocks/data/data_e.xls"
    ]
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            print(f"   Found: {path}")
            break
    
    if not file_path:
        print(f"⚠️  JP market file not found in any of: {possible_paths}")
        return []
    
    try:
        # Read Excel file (may need to try different sheet names)
        df = pd.read_excel(file_path, sheet_name=0)
        
        print(f"   Available columns: {list(df.columns)}")
        
        # Common column name variations for Japanese exchanges
        ticker_cols = ['Local Code']
        name_cols = ['Name (English)']
        sector_cols = ['33 Sector(name)', '17 Sector(name)']
        type_cols = ['Asset Type', 'Type', 'Category', 'Product Type', 'Classification', 'Market Segment']
        
        # Find the right columns
        ticker_col = next((col for col in ticker_cols if col in df.columns), None)
        name_col = next((col for col in name_cols if col in df.columns), None)
        sector_col = next((col for col in sector_cols if col in df.columns), None)
        type_col = next((col for col in type_cols if col in df.columns), None)
        
        if not ticker_col:
            print(f"❌ Could not find ticker column in {file_path}")
            print(f"Available columns: {list(df.columns)}")
            return []
        
        results = []
        etf_count = 0
        stock_count = 0
        
        for _, row in df.iterrows():
            ticker_raw = str(row.get(ticker_col, "")).strip()
            if not ticker_raw or ticker_raw == "nan":
                continue
            
            # Remove any existing suffixes and add .T
            ticker_clean = ticker_raw.replace(".T", "").replace(".JP", "")
            ticker = f"{ticker_clean}.T"
            display_ticker = ticker_clean
            
            company_name = str(row.get(name_col, ticker_clean)) if name_col else ticker_clean
            sector = str(row.get(sector_col, "")) if sector_col else ""
            
            # Determine asset type from Excel column or name
            asset_type = "stock"
            if type_col:
                type_value = str(row.get(type_col, "")).strip().lower()
                if "etf" in type_value:
                    asset_type = "etf"
                    etf_count += 1
                else:
                    stock_count += 1
            else:
                # Fallback: check if "ETF" appears in the company name
                if "etf" in company_name.lower():
                    asset_type = "etf"
                    etf_count += 1
                else:
                    stock_count += 1
            
            company_name, asset_type = normalize_name_and_asset(company_name.strip(), asset_type)

            results.append({
                "ticker": ticker,
                "displayTicker": display_ticker,
                "companyName": company_name,
                "country": "JP",
                "primaryExchange": "TSE",
                "sectorGroup": sector.strip(),
                "assetType": asset_type,
                "status": "active",
                "createdAt": datetime.utcnow().isoformat(),
                "updatedAt": datetime.utcnow().isoformat()
            })
        
        print(f"✅ Parsed {len(results)} JP items ({stock_count} stocks + {etf_count} ETFs)")
        return results
    
    except Exception as e:
        print(f"❌ Error parsing JP market: {e}")
        return []

def parse_jp_etfs():
    """Deprecated - JP ETFs are now parsed from the Excel file automatically"""
    return []

def parse_th_market():
    """Parse Thai market from listedCompanies_en_US.xlsm"""
    print("\n📊 Parsing TH market (listedCompanies_en_US.xlsm)...")
    
    # Try multiple paths and extensions
    possible_paths = [
        "data/listedCompanies_en_US.xlsm",
        "stocks/data/listedCompanies_en_US.xlsm",
        "data/listedCompanies_en_US.xlsx",
        "stocks/data/listedCompanies_en_US.xlsx",
        "data/listedCompanies_en_US.xls",
        "stocks/data/listedCompanies_en_US.xls"
    ]
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            print(f"   Found: {path}")
            break
    
    if not file_path:
        print(f"⚠️  TH market file not found in any of: {possible_paths}")
        return []
    
    try:
        # Read Excel file
        df = pd.read_excel(file_path, sheet_name=0)
        
        # Common column variations for Thai exchanges
        ticker_cols = ['Symbol']
        name_cols = ['Company']
        sector_cols = ['Sector']
        
        # Find the right columns
        ticker_col = next((col for col in ticker_cols if col in df.columns), None)
        name_col = next((col for col in name_cols if col in df.columns), None)
        sector_col = next((col for col in sector_cols if col in df.columns), None)
        
        if not ticker_col:
            print(f"❌ Could not find ticker column in {file_path}")
            print(f"Available columns: {list(df.columns)}")
            return []
        
        results = []
        for _, row in df.iterrows():
            ticker_raw = str(row.get(ticker_col, "")).strip()
            if not ticker_raw or ticker_raw == "nan":
                continue
            
            # Remove any existing suffixes and add .BK
            ticker_clean = ticker_raw.replace(".BK", "").replace(".TH", "")
            ticker = f"{ticker_clean}.BK"
            display_ticker = ticker_clean
            
            company_name = str(row.get(name_col, ticker_clean)) if name_col else ticker_clean
            sector = str(row.get(sector_col, "")) if sector_col else ""

            company_name, asset_type = normalize_name_and_asset(company_name.strip(), "stock")
            
            results.append({
                "ticker": ticker,
                "displayTicker": display_ticker,
                "companyName": company_name,
                "country": "TH",
                "primaryExchange": "SET",
                "sectorGroup": sector.strip(),
                "assetType": asset_type,
                "status": "active",
                "createdAt": datetime.utcnow().isoformat(),
                "updatedAt": datetime.utcnow().isoformat()
            })
        
        print(f"✅ Parsed {len(results)} TH stocks")
        return results
    
    except Exception as e:
        print(f"❌ Error parsing TH market: {e}")
        return []

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
            "status": "active",
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
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
                    "status": "active",
                    "createdAt": datetime.utcnow().isoformat(),
                    "updatedAt": datetime.utcnow().isoformat()
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
                "status": "active",
                "createdAt": datetime.utcnow().isoformat(),
                "updatedAt": datetime.utcnow().isoformat()
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
    print("=" * 60)
    print("🚀 Building Comprehensive MarketLists")
    print("=" * 60)
    
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

    backup_path = "stocks/json/251218-1404 marketlists_backup.json"
    if os.path.exists(backup_path):
        use_backup = input(f"\n📂 Merge missing tickers from backup {backup_path}? (y/N): ").strip().lower() == "y"
        if use_backup:
            backup_items = load_backup(backup_path)
            if backup_items:
                existing = {t["ticker"]: t for t in all_tickers}
                added = 0
                for item in backup_items:
                    tic = item.get("ticker")
                    if not tic or tic in existing:
                        continue
                    name_clean, asset_type = normalize_name_and_asset(item.get("companyName"), item.get("assetType", "stock"))
                    item["companyName"] = name_clean
                    item["assetType"] = asset_type
                    existing[tic] = item
                    added += 1
                all_tickers = list(existing.values())
                print(f"✅ Added {added} tickers from backup")
    
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
    
    # Save to JSON backup
    backup_file = "stocks/json/marketlists_backup.json"
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
