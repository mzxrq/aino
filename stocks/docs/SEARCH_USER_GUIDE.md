# Global Stock Search - User Experience Guide

## Before vs After

### ❌ OLD WAY (Manual Entry)
```
User opens Chart page
       ↓
Sees: "e.g. 9020.T, AAPL" placeholder
       ↓
User has to:
  1. Remember exact ticker symbols
  2. Know market suffixes (.T for Japan, .BK for Thailand)
  3. Type manually: "9020.T, 1301.T, 6758.T, AAPL"
  4. Remember or look up company names
       ↓
Error-prone, requires external knowledge
```

### ✅ NEW WAY (Intelligent Search)
- Type company name or ticker fragment (e.g., "apple", "kyokuyo")
- Select result from dropdown
- Result is added as yfinance-ready symbol (e.g., `AAPL`, `1301.T`, `2S.BK`)

### Accessibility & UX
- Keyboard navigation supported
- Aria attributes present for screen reader compatibility
- Exchange badges with high contrast colors

### Quick Tips
- Search by company name for best results
- Partial matches are supported
- Click outside dropdown to close

