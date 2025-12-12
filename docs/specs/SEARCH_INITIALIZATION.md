<!-- Created: 2025-12-12 08:30 JST | Last Updated: 2025-12-12 08:30 JST -->

# Search Database Initialization

The search functionality requires populated `marketlists` collection in MongoDB with 800+ stock tickers and company names.

## Quick Seed

**Option A: API Endpoint (Recommended)**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/py/seed/marketlists" -Method POST
```

Result:
```json
{
  "status": "success",
  "inserted": 800,
  "deleted": 0,
  "message": "Successfully seeded 800 tickers into marketlists collection"
}
```

**Option B: Python Script**
```powershell
cd backend-python
python seed_marketlists.py
```

## Data Source

- File: `docs/others/tickers.json` (800+ global stocks)
- Collections: US stocks (NASDAQ, NYSE), Japanese stocks (TSE), Thai stocks (SET)
- Fields: ticker, companyName, country, primaryExchange, sectorGroup

## Indexes Created

Automatic indexes on:
- `ticker` - for fast ticker symbol search
- `companyName` - for fast company name search

## Search Features

After seeding, the search bar supports:
- **Ticker search**: "AAPL", "ADVANC", "7203"
- **Company name search**: "Apple", "Advanced Micro", "Toyota"
- **Partial matching**: "ama" → "Amazon", "jpmorgan"
- **Case-insensitive**: All queries normalized to uppercase

## MongoDB Command (Manual)

```javascript
// Check if collection is populated
db.marketlists.countDocuments()  // Should return 800+

// Sample query
db.marketlists.find({ "ticker": "AAPL" })
db.marketlists.find({ "companyName": /apple/i })  // Case-insensitive
```

---
