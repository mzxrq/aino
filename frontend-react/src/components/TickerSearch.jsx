import React, { useState, useEffect, useRef, useMemo } from 'react';
import '../css/TickerSearch.css';

/**
 * TickerSearch Component
 * Autocomplete search with global ticker database
 * Displays: "KYOKUYO CO.,LTD (1301.T)" but returns symbol "1301.T" for charting
 */
export default function TickerSearch({ onSelect, placeholder = "Search stocks by name or symbol..." }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Load master ticker list on mount
  useEffect(() => {
    const loadTickers = async () => {
      try {
        const response = await fetch('/master_tickers.json');
        const data = await response.json();
        setTickers(data);
        console.log(`[TickerSearch] Loaded ${data.length} tickers`);
      } catch (error) {
        console.error('[TickerSearch] Error loading tickers:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTickers();
  }, []);

  // Search logic - fuzzy match on symbol and name
  const filteredSuggestions = useMemo(() => {
    if (!input.trim() || input.length < 1) {
      return [];
    }

    const query = input.toLowerCase().trim();
    const results = [];

    for (const ticker of tickers) {
      const symbol = ticker.symbol.toLowerCase();
      const name = (ticker.name || '').toLowerCase();

      // Exact match on symbol gets priority
      if (symbol === query) {
        results.unshift({ ...ticker, score: 1000 });
        continue;
      }

      // Symbol starts with query
      if (symbol.startsWith(query)) {
        results.push({ ...ticker, score: 900 });
        continue;
      }

      // Name starts with query
      if (name.startsWith(query)) {
        results.push({ ...ticker, score: 800 });
        continue;
      }

      // Symbol contains query
      if (symbol.includes(query)) {
        results.push({ ...ticker, score: 700 });
        continue;
      }

      // Name contains query
      if (name.includes(query)) {
        results.push({ ...ticker, score: 600 });
        continue;
      }
    }

    // Sort by score and limit to 15 results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(({ score, ...item }) => item);
  }, [input, tickers]);

  // Show dropdown when suggestions available
  useEffect(() => {
    if (filteredSuggestions.length > 0 && input.trim()) {
      setShowDropdown(true);
      setSuggestions(filteredSuggestions);
    } else {
      setShowDropdown(false);
      setSuggestions([]);
    }
  }, [filteredSuggestions, input]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (ticker) => {
    // Display user-friendly format, return yfinance format
    setInput(`${ticker.name} (${ticker.symbol})`);
    setShowDropdown(false);
    
    // Call parent callback with symbol only (for charting)
    if (onSelect) {
      onSelect(ticker.symbol);
    }
  };

  const handleClear = () => {
    setInput('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  return (
    <div className="ticker-search-container">
      <div className="ticker-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="ticker-search-input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => input.trim() && setShowDropdown(true)}
          disabled={loading}
          aria-label="Search tickers"
        />
        {input && (
          <button 
            className="ticker-search-clear" 
            onClick={handleClear}
            aria-label="Clear search"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul ref={dropdownRef} className="ticker-search-dropdown">
          {suggestions.map((ticker) => (
            <li
              key={`${ticker.symbol}-${ticker.exchange}`}
              className="ticker-search-item"
              onClick={() => handleSelect(ticker)}
              role="option"
            >
              <div className="ticker-search-item-header">
                <span className="ticker-symbol">{ticker.symbol}</span>
                <span className={`ticker-exchange exchange-${ticker.exchange}`}>
                  {ticker.exchange}
                </span>
              </div>
              <div className="ticker-name">{ticker.name}</div>
            </li>
          ))}
        </ul>
      )}

      {loading && (
        <div className="ticker-search-loading">Loading tickers...</div>
      )}

      {!loading && input.trim() && !showDropdown && suggestions.length === 0 && (
        <div className="ticker-search-no-results">No tickers found</div>
      )}
    </div>
  );
}
