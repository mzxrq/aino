"""
Curated list of stocks for real-time anomaly monitoring.
Organized by market for efficient scheduling.
"""

# US Market - Top Tech, Finance, Healthcare, Energy stocks
US_STOCKS = [
    # FAANG + Big Tech
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
    # Finance
    'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C',
    # Healthcare/Pharma
    'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'TMO',
    # Consumer
    'WMT', 'HD', 'DIS', 'NKE', 'SBUX', 'MCD',
    # Energy/Industrials
    'XOM', 'CVX', 'BA', 'CAT', 'GE',
    # Semiconductors
    'INTC', 'AMD', 'QCOM', 'AVGO',
    # Other Major
    'V', 'MA', 'NFLX', 'PYPL', 'CRM'
]

# Japan Market - Nikkei 225 leaders
JP_STOCKS = [
    # Tech/Electronics
    'SONY.T', '6758.T',      # Sony, Sony Group
    '6861.T',                 # Keyence
    '6954.T',                 # Fanuc
    # Automotive
    '7203.T',                 # Toyota
    '7267.T',                 # Honda
    '7201.T',                 # Nissan
    # Finance
    '8306.T',                 # Mitsubishi UFJ
    '8411.T',                 # Mizuho
    '8316.T',                 # Sumitomo Mitsui
    # Industrials/Trading
    '8001.T',                 # Itochu
    '8002.T',                 # Marubeni
    '8031.T',                 # Mitsui
    # Consumer
    '4502.T',                 # Takeda Pharma
    '4503.T',                 # Astellas Pharma
    '9984.T',                 # SoftBank Group
]

# Thailand Market - SET leaders
TH_STOCKS = [
    # Telecom
    'ADVANC.BK',              # Advanced Info Service
    'TRUE.BK',                # True Corporation
    'DTAC.BK',                # Total Access Communication
    # Finance
    'BBL.BK',                 # Bangkok Bank
    'KBANK.BK',               # Kasikornbank
    'SCB.BK',                 # Siam Commercial Bank
    'KTB.BK',                 # Krung Thai Bank
    # Energy/Utilities
    'PTT.BK',                 # PTT Public Company
    'PTTEP.BK',               # PTT Exploration and Production
    'PTTGC.BK',               # PTT Global Chemical
    'BANPU.BK',               # Banpu
    # Real Estate/Construction
    'AP.BK',                  # AP (Thailand)
    'CPN.BK',                 # Central Pattana
    'LH.BK',                  # Land and Houses
    # Consumer
    'CPALL.BK',               # CP ALL (7-Eleven Thailand)
    'CPF.BK',                 # Charoen Pokphand Foods
]

# Combined list for easy access
ALL_MONITORED_STOCKS = US_STOCKS + JP_STOCKS + TH_STOCKS

# Market mappings
MARKET_STOCKS = {
    'US': US_STOCKS,
    'JP': JP_STOCKS,
    'TH': TH_STOCKS
}


def get_stocks_by_market(market: str):
    """Get list of monitored stocks for a specific market."""
    return MARKET_STOCKS.get(market, [])


def get_all_stocks():
    """Get all monitored stocks across all markets."""
    return ALL_MONITORED_STOCKS


def get_market_count():
    """Get count of stocks per market."""
    return {
        'US': len(US_STOCKS),
        'JP': len(JP_STOCKS),
        'TH': len(TH_STOCKS),
        'Total': len(ALL_MONITORED_STOCKS)
    }
