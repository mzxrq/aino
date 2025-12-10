import os
import requests

def get_company_domain(ticker: str):
    """
    Get company website domain from Yahoo Finance API.
    Example: AAPL → apple.com
    """
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=assetProfile"
    try:
        r = requests.get(url, timeout=5)
        data = r.json()
        website = data["quoteSummary"]["result"][0]["assetProfile"]["website"]
        # Normalize (remove http/https)
        domain = website.replace("https://", "").replace("http://", "").rstrip("/")
        return domain
    except Exception as e:
        print(f"[Domain Error] {ticker}: {e}")
        return None


def get_logo_url(domain: str):
    """
    Try Clearbit first, fallback to Google Favicon.
    """
    clearbit_url = f"https://logo.clearbit.com/{domain}"
    google_favicon_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"

    # If Clearbit actually returns an image (200)
    try:
        r = requests.get(clearbit_url, timeout=5)
        if r.status_code == 200 and r.headers["content-type"].startswith("image"):
            return clearbit_url
    except:
        pass

    # Fallback
    return google_favicon_url


def download_logo(ticker: str, save_folder="logos"):
    """
    Combined pipeline:
    1. Get domain
    2. Get best logo
    3. Download to logos/{ticker}.png
    """
    os.makedirs(save_folder, exist_ok=True)

    # Step 1: domain lookup
    domain = get_company_domain(ticker)
    if not domain:
        print(f"❌ No domain for {ticker}")
        return None

    # Step 2: get best logo URL
    logo_url = get_logo_url(domain)

    # Step 3: download
    file_path = f"{save_folder}/{ticker}.png"
    try:
        r = requests.get(logo_url, timeout=5)
        with open(file_path, "wb") as f:
            f.write(r.content)
        print(f"✅ Saved: {file_path}")
        return file_path
    except Exception as e:
        print(f"❌ Logo download failed {ticker}: {e}")
        return None


# ----------------------
# Example usage
# ----------------------

download_logo("AAPL")
download_logo("MSFT")
download_logo("TSLA")
download_logo("GOOGL")