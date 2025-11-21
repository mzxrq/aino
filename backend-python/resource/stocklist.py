# resource/stocklist.py

# --- Paths for market models ---
MODEL_PATHS = {
    "US": ".\\resource\\models\\US_model-0.1.0.pkl",
    "JP": ".\\resource\\models\\JP_model-0.1.0.pkl",
    "TH": ".\\resource\\models\\TH_model-0.1.0.pkl"
}

# --- Example symbols for training per market (Full list from notebook) ---
MARKET_SYMBOLS = {
    "US": [
    "NVDA", 
    "AAPL", 
    "MSFT", "GOOGL", "AMZN", "META", "AVGO", "TSLA", "BRK.B", "WMT",
    "JPM", "ORCL", "LLY", "V", "JNJ", "PG", "HD", "MA", "UNH", "XOM"
    ],
    "JP": [
    "7203.T", 
    "8306.T", "6758.T", "6501.T", "7974.T", "9983.T", "9984.T", "8316.T",
    "6861.T", "6098.T", "8035.T", "4519.T", "7011.T", "8001.T", "8766.T", "8058.T",
    "9434.T", "9433.T", "8411.T", "4063.T"
    ],
    "TH": [
    "DELTA.BK", 
    "PTT.BK", "ADVANC.BK", "GULF.BK", "AOT.BK", "KBANK.BK", "SCB.BK",
    "PTTEP.BK", "TRUE.BK", "IVL.BK", "TIDLOR.BK", "TU.BK", "SCGP.BK", "TOP.BK",
    "HMPRO.BK", "BBL.BK", "CENTEL.BK", "BGRIM.BK", "BCPB.BK", "TTW.BK"
    ]
}

def get_market_symbols(market_key):
    return MARKET_SYMBOLS.get(market_key, [])