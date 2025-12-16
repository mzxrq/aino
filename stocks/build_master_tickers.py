"""
Build Master Ticker List for Global Stock Search
Merges US (NASDAQ/NYSE/AMEX), Japan (TSE), and Thailand (SET) markets
Output: master_tickers.json with [symbol, name, exchange] for fast autocomplete
"""

import pandas as pd
import json
import requests
from pathlib import Path

def fetch_us_tickers():
    """Fetch US tickers from GitHub: https://github.com/rreichel3/US-Stock-Symbols"""
    print("[US] Loading US tickers from GitHub...")
    
    tickers = []
    
    # Exchanges to fetch from GitHub
    exchanges = ['nasdaq', 'nyse', 'amex']
    github_base = 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main'
    
    for exchange in exchanges:
        exch_label = exchange.upper()
        # Try to fetch full ticker info (contains symbol + name)
        tried_urls = []
        try:
            full_url = f'{github_base}/{exchange}/{exchange}_full_tickers.json'
            short_url = f'{github_base}/{exchange}/{exchange}_tickers.json'
            tried_urls = [full_url, short_url]

            print(f"[US] Trying full-list for {exch_label}: {full_url}")
            resp = requests.get(full_url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                print(f"[US] Got {len(data)} {exch_label} full entries")
                for item in data:
                    # item may be dict with symbol + name
                    symbol = item.get('symbol') if isinstance(item, dict) else None
                    name = item.get('name') if isinstance(item, dict) else None
                    if not symbol and isinstance(item, str):
                        symbol = item
                    if not symbol:
                        continue
                    symbol = symbol.strip()
                    tickers.append({
                        'symbol': symbol,
                        'name': (name.strip() if name else symbol),
                        'exchange': exch_label
                    })
                continue

            # If full list not available, fallback to simple tickers list
            print(f"[US] Full list not available, trying short list: {short_url}")
            resp2 = requests.get(short_url, timeout=10)
            resp2.raise_for_status()
            exchange_tickers = resp2.json()
            print(f"[US] Got {len(exchange_tickers)} {exch_label} tickers (short list)")
            for ticker in exchange_tickers:
                tickers.append({
                    'symbol': ticker,
                    'name': ticker,
                    'exchange': exch_label
                })
        except Exception as e:
            print(f"[WARNING] Failed to fetch {exchange} (tried {tried_urls}): {e}")
    
    if tickers:
        print(f"[SUCCESS] Loaded {len(tickers)} US tickers from GitHub")
        return tickers
    
    # Fallback to local file if GitHub fails
    local_path = Path('../docs/others/tickers.json')
    if local_path.exists():
        try:
            print("[INFO] GitHub failed, using local tickers.json")
            try:
                with open(local_path, 'r', encoding='utf-8-sig') as f:
                    data = json.load(f)
            except:
                with open(local_path, 'r', encoding='latin-1') as f:
                    data = json.load(f)
            
            us_tickers = []
            for ticker_dict in data:
                if ticker_dict.get('country') == 'US':
                    symbol = ticker_dict.get('ticker', '').strip()
                    # Replace dot with dash for consistency (e.g., BRK.B -> BRK-B)
                    symbol = symbol.replace('.', '-')
                    if symbol:
                        us_tickers.append({
                            'symbol': symbol,
                            'name': ticker_dict.get('companyName', symbol),
                            'exchange': 'US'
                        })
            
            print(f"[OK] Loaded {len(us_tickers)} US tickers from local file")
            return us_tickers
        except Exception as e:
            print(f"[ERROR] Error reading local tickers.json: {e}")
            return []
    
    # Fallback to GitHub (if available)
    try:
        print("[RETRY] Trying GitHub source...")
        url = "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.json"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"[WARN] GitHub source failed: {e}")
        print("[INFO] Proceeding with JP and TH data only")
        return []
    
    try:
        us_tickers = []
        for ticker_dict in data:
            if isinstance(ticker_dict, dict):
                symbol = ticker_dict.get('symbol', '').strip()
                name = ticker_dict.get('name')
            else:
                symbol = str(ticker_dict).strip()
                name = None

            symbol = symbol.replace('.', '-')
            if symbol:
                us_tickers.append({
                    'symbol': symbol,
                    'name': name if name else symbol,
                    'exchange': 'US'
                })

        print(f"[OK] Fetched {len(us_tickers)} US tickers from GitHub")
        return us_tickers
    except Exception as e:
        print(f"[ERROR] Error processing US tickers: {e}")
        return []

def parse_japanese_tickers():
    """Parse Japanese market tickers from data_e.xls"""
    print("[JP] Parsing Japanese tickers from data_e.xls...")
    try:
        df = pd.read_excel('data_e.xls')
        jp_tickers = []
        
        for _, row in df.iterrows():
            code = str(row.get('Local Code', '')).strip()
            name = str(row.get('Name (English)', '')).strip()
            
            if code and code != 'nan':
                # Append .T suffix for TSE
                symbol = f"{code}.T"
                jp_tickers.append({
                    'symbol': symbol,
                    'name': name if name and name != 'nan' else code,
                    'exchange': 'TSE'
                })
        
        print(f"[OK] Parsed {len(jp_tickers)} Japanese tickers")
        return jp_tickers
    except Exception as e:
        print(f"[ERROR] Error parsing Japanese tickers: {e}")
        return []

def parse_thai_tickers():
    """Parse Thai market tickers from listedCompanies_en_US.xls (HTML table)"""
    print("[TH] Parsing Thai tickers from listedCompanies_en_US.xls...")
    try:
        # Read as HTML table (pandas read_html)
        dfs = pd.read_html('listedCompanies_en_US.xls')
        df = dfs[0]  # First table
        
        th_tickers = []
        # Skip header rows (first few rows are headers)
        for idx, row in df.iterrows():
            # Column 0 is Symbol, Column 1 is Company Name (rough indices)
            if idx < 2:  # Skip header rows
                continue
            
            symbol = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
            name = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ''
            
            # Filter out placeholder rows and headers
            if symbol and symbol not in ['Symbol', 'List', 'No.'] and not symbol.startswith('List'):
                # Determine market if available (some tables include Market/Exchange column)
                market_label = None
                for colname in ['Market', 'Market Type', 'Market/Exchange', 'Exchange']:
                    if colname in df.columns:
                        try:
                            val = row[colname]
                            if pd.notna(val):
                                market_label = str(val).strip().lower()
                                break
                        except Exception:
                            pass

                # Default to SET, detect mai
                exch = 'SET'
                if market_label and 'mai' in market_label:
                    exch = 'MAI'

                # Append .BK suffix for SET listings (keep .BK for now)
                symbol = f"{symbol}.BK"
                th_tickers.append({
                    'symbol': symbol,
                    'name': name if name and name != 'nan' else symbol.replace('.BK', ''),
                    'exchange': exch
                })
        
        print(f"[OK] Parsed {len(th_tickers)} Thai tickers")
        return th_tickers
    except Exception as e:
        print(f"[ERROR] Error parsing Thai tickers: {e}")
        return []

def build_master_list():
    """Build consolidated master ticker list"""
    print("\n" + "="*60)
    print("Building Master Ticker List")
    print("="*60 + "\n")
    
    # Fetch/parse all tickers
    us_tickers = fetch_us_tickers()
    jp_tickers = parse_japanese_tickers()
    th_tickers = parse_thai_tickers()
    
    # Combine all
    all_tickers = us_tickers + jp_tickers + th_tickers
    
    # Remove duplicates (keep first occurrence)
    seen = set()
    unique_tickers = []
    for ticker in all_tickers:
        symbol = ticker['symbol']
        if symbol not in seen:
            seen.add(symbol)
            unique_tickers.append(ticker)
    
    print(f"\nSummary:")
    print(f"   US:    {len(us_tickers):,} tickers")
    print(f"   Japan: {len(jp_tickers):,} tickers")
    print(f"   Thai:  {len(th_tickers):,} tickers")
    print(f"   Total: {len(unique_tickers):,} unique tickers")
    
    # Sort by symbol for fast binary search
    unique_tickers.sort(key=lambda x: x['symbol'].lower())
    
    # Save to JSON
    output_file = Path('master_tickers.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(unique_tickers, f, indent=2, ensure_ascii=False)
    
    print(f"\n[OK] Saved to {output_file}")
    
    # Show sample entries from each market
    # Also copy to frontend public directory if available
    frontend_path = Path('../frontend-react/public/master_tickers.json')
    try:
        frontend_path.parent.mkdir(parents=True, exist_ok=True)
        with open(frontend_path, 'w', encoding='utf-8') as ff:
            json.dump(unique_tickers, ff, indent=2, ensure_ascii=False)
        print(f"[OK] Copied master list to {frontend_path}")
    except Exception as e:
        print(f"[WARN] Could not copy to frontend public path: {e}")

    print("\nSample entries:")
    us_samples = [t for t in unique_tickers if t['exchange'] == 'US'][:3]
    jp_samples = [t for t in unique_tickers if t['exchange'] == 'TSE'][:3]
    th_samples = [t for t in unique_tickers if t['exchange'] in ('SET','MAI')][:3]
    
    print("\nUS Samples:")
    for t in us_samples:
        print(f"  {t['symbol']:10} - {t['name']}")
    
    print("\nJP Samples:")
    for t in jp_samples:
        print(f"  {t['symbol']:10} - {t['name']}")
    
    print("\nTH Samples:")
    for t in th_samples:
        print(f"  {t['symbol']:10} - {t['name']}")
    
    return unique_tickers

if __name__ == '__main__':
    build_master_list()
