import { useState, useEffect, useRef } from "react";
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from "react-router-dom";
import "../css/Search.css";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [logoFailCache] = useState(new Set());
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { i18n } = useLingui();
  const API_URL = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050';
  const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
  const PY_BASE = `${API_URL}/py`;

  // Localization helper
  const locale = (i18n?.locale || 'en').toLowerCase();
  const localePrefix = locale.split('-')[0];
  const localizedName = (item) => {
    const hasLocal = item.companyNameLocal && item.companyNameLocal.trim();
    const isJa = localePrefix === 'ja' || localePrefix === 'jp';
    const isTh = localePrefix === 'th';
    const country = (item.country || '').toUpperCase();
    const ticker = item.ticker || item.symbol || '';
    
    if (hasLocal) {
      if (isJa && (country === 'JP' || ticker.endsWith('.T'))) return item.companyNameLocal.trim();
      if (isTh && (country === 'TH' || ticker.endsWith('.BK'))) return item.companyNameLocal.trim();
    }
    return item.name || item.companyName || ticker;
  };
  async function fetchPyJson(path, init) {
    try {
      const r = await fetch(`${PY_BASE}${path}`, init);
      if (r.ok) return await r.json();
    } catch (_) { /* ignore */ }
    const r2 = await fetch(`${PY_DIRECT}/py${path}`, init);
    if (!r2.ok) throw new Error(`status ${r2.status}`);
    return await r2.json();
  }

  // Debounced AJAX search
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!query) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      try {
        const data = await fetchPyJson(`/chart/ticker?query=${encodeURIComponent(query)}`);

        // Normalize backend response: symbol -> ticker
        const normalized = Array.isArray(data) ? data.map(item => ({
          ...item,
          ticker: item.ticker || item.symbol,
          name: item.name || item.companyName,
          companyNameLocal: item.companyNameLocal || ''
        })) : [];

        setResults(normalized);
        setShowDropdown(normalized.length > 0);
      } catch (err) {
        console.error(err);
        setResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, API_URL]);

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (ticker) => {
    setShowDropdown(false);
    setQuery("");
    navigate(`/chart/u/${ticker}`);
  };

  const handleShowMore = () => {
    setShowDropdown(false);
    setQuery("");
    navigate("/list");
  };

  return (
    <div className="search-container" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={i18n._("Search ticker...")}
        className="search-input"
        onFocus={() => query && results.length && setShowDropdown(true)}
      />
      {showDropdown && (
        <div className="search-dropdown">
          <ul className="search-results-list">
            {results.slice(0, 5).map((item) => {
              const displayName = localizedName(item);
              const logoPath = `/logos/${item.ticker}.png`;
              
              return (
                <li key={item.ticker} className="search-item">
                  <button
                    className="search-link"
                    onClick={() => handleResultClick(item.ticker)}
                  >
                    <div className="search-item-logo">
                      {!logoFailCache.has(item.ticker) && (
                        <img 
                          src={logoPath} 
                          alt={item.ticker}
                          className="search-logo"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            logoFailCache.add(item.ticker);
                          }}
                        />
                      )}
                      {logoFailCache.has(item.ticker) && (
                        <img 
                          src="/no-logo.svg" 
                          alt="No logo"
                          className="search-logo-fallback"
                        />
                      )}
                    </div>
                    <div className="search-item-info">
                      <span className="ticker">{item.ticker}</span>
                      <span className="name">{displayName}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {results.length > 0 && (
            <button className="search-show-more" onClick={handleShowMore}>
              <Trans>Show More →</Trans>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
