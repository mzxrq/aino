import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import '../css/TickerSearch.css';

/**
 * TickerSearch Component
 * Autocomplete search with global ticker database
 * Displays: "KYOKUYO CO.,LTD (1301.T)" but returns symbol "1301.T" for charting
 */
const TickerSearch = forwardRef(function TickerSearch({ onSelect, placeholder = "Search stocks by name or symbol...", showInput = true }, ref) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalQuery, setModalQuery] = useState('');
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const modalInputRef = useRef(null);

  // Load master ticker list on mount (fallback source)
  useEffect(() => {
    const loadTickers = async () => {
      try {
        const response = await fetch('/master_tickers.json');
        const data = await response.json();
        setTickers(data);
      } catch (error) {
        // silently ignore fallback load errors; modal will use server-side lookup
      } finally {
        setLoading(false);
      }
    };
    loadTickers();
  }, []);

  // Search logic - fuzzy match on symbol and name
  // Prioritize company name matches before symbol matches per UX request.
  const filteredSuggestions = useMemo(() => {
    if (!input.trim() || input.length < 1) {
      return [];
    }

    const query = input.toLowerCase().trim();
    const results = [];

    for (const ticker of tickers) {
      const symbol = (ticker.symbol || '').toLowerCase();
      const name = (ticker.name || '').toLowerCase();
      const display = ((ticker.displayTicker || ticker.display) || (ticker.symbol || '').split('.')[0]).toString().toLowerCase();

      // Name starts with query -> highest priority
      if (name.startsWith(query) && name.length) {
        results.push({ ...ticker, score: 1000 });
        continue;
      }

      // DisplayTicker exact/starts includes (e.g., user types "1301")
      if (display === query && display.length) {
        results.push({ ...ticker, score: 950 });
        continue;
      }

      // Exact match on symbol still ranks high but after name-starts
      if (symbol === query && symbol.length) {
        results.push({ ...ticker, score: 900 });
        continue;
      }

      // Name contains query
      if (name.includes(query) && name.length) {
        results.push({ ...ticker, score: 900 });
        continue;
      }

      // Symbol starts with query
      if (symbol.startsWith(query) && symbol.length) {
        results.push({ ...ticker, score: 800 });
        continue;
      }

      // Symbol contains query
      if (symbol.includes(query) && symbol.length) {
        results.push({ ...ticker, score: 700 });
        continue;
      }
    }

    // Sort by score and limit to 15 results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(({ score, ...item }) => item);
  }, [input, tickers]);

  // Show dropdown when inline suggestions available (legacy)
  useEffect(() => {
    if (filteredSuggestions.length > 0 && input.trim()) {
      setShowDropdown(true);
      setSuggestions(filteredSuggestions);
    } else {
      setShowDropdown(false);
      setSuggestions([]);
    }
  }, [filteredSuggestions, input]);

  // Server-side modal search results and debounce
  const [modalResults, setModalResults] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  useEffect(() => {
    if (!showModal) return;
    let mounted = true;
    let timer = null;
    const q = modalQuery && modalQuery.trim();
    const doFallbackFilter = () => {
      if (!q) return [];
      const lq = q.toLowerCase();
      return tickers.filter(t => {
        const symbol = (t.symbol || '').toLowerCase();
        const name = (t.name || '').toLowerCase();
        const display = ((t.displayTicker || t.display) || (t.symbol || '').split('.')[0]).toString().toLowerCase();
        return symbol.includes(lq) || name.includes(lq) || display.includes(lq);
      }).slice(0, 400);
    };

    if (!q) {
      setModalResults([]);
      setModalLoading(false);
      return () => {};
    }

    timer = setTimeout(async () => {
      setModalLoading(true);
      try {
        const front = import.meta.env.VITE_API_URL || '';
        const pyDirect = import.meta.env.VITE_LINE_PY_URL || '';
        let url = `${front}/py/chart/ticker?query=${encodeURIComponent(q)}`;
        let res;
        try {
          res = await fetch(url);
          if (!res.ok) throw new Error(`status ${res.status}`);
        } catch (err) {
          // fallback to direct python host if gateway not available
          try {
            url = `${pyDirect}/py/chart/ticker?query=${encodeURIComponent(q)}`;
            res = await fetch(url);
            if (!res.ok) throw new Error(`fallback status ${res.status}`);
          } catch (err2) {
            // network error: fallback to client-side filter
            const fb = doFallbackFilter();
            if (mounted) setModalResults(fb);
            return;
          }
        }

        const json = await res.json();
        // Normalize server response to { symbol, name, exchange } and prioritize name matches
        if (Array.isArray(json)) {
          const norm = json.map(item => {
            const rawSym = (item.symbol || item.ticker || item.ticker_symbol || item.code || '').toString();
            const symbol = rawSym ? rawSym.toUpperCase() : '';
            const name = item.name || item.company || item.label || item.longName || '';
            const exchange = item.exchange || item.exch || item.market || item.market_code || '';
            const display = (item.displayTicker || item.display || (symbol ? symbol.split('.')[0] : '')).toString();
            return { symbol, name, exchange, displayTicker: display };
          }).filter(x => x.symbol || x.name || x.displayTicker);

          // If we have a query, sort so that results with company name matches come first
          if (q) {
            const lq = q.toLowerCase();
            norm.sort((a, b) => {
              const aName = (a.name || '').toLowerCase();
              const bName = (b.name || '').toLowerCase();
              const aSym = (a.symbol || '').toLowerCase();
              const bSym = (b.symbol || '').toLowerCase();
              const aDisp = (a.displayTicker || '').toLowerCase();
              const bDisp = (b.displayTicker || '').toLowerCase();

              const aScore = (aName.startsWith(lq) ? 1100 : (aName.includes(lq) ? 1000 : 0)) + (aDisp === lq ? 900 : (aDisp.startsWith(lq) ? 700 : (aDisp.includes(lq) ? 400 : 0))) + (aSym === lq ? 500 : (aSym.startsWith(lq) ? 300 : (aSym.includes(lq) ? 100 : 0)));
              const bScore = (bName.startsWith(lq) ? 1100 : (bName.includes(lq) ? 1000 : 0)) + (bDisp === lq ? 900 : (bDisp.startsWith(lq) ? 700 : (bDisp.includes(lq) ? 400 : 0))) + (bSym === lq ? 500 : (bSym.startsWith(lq) ? 300 : (bSym.includes(lq) ? 100 : 0)));
              return bScore - aScore;
            });
          }

          if (mounted) setModalResults(norm.slice(0, 400));
        } else {
          // fallback to client-side if unexpected payload
          const fb = doFallbackFilter();
          if (mounted) setModalResults(fb);
        }
      } catch (e) {
        const fb = doFallbackFilter();
        if (mounted) setModalResults(fb);
      } finally {
        if (mounted) setModalLoading(false);
      }
    }, 250);

    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, [modalQuery, showModal, tickers]);

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

  // Close modal on outside click or ESC
  useEffect(() => {
    if (!showModal) return;
    function handleKey(e) {
      if (e.key === 'Escape') setShowModal(false);
    }
    function handleClickOutside(e) {
      if (modalInputRef.current && !modalInputRef.current.contains(e.target)) {
        // if click is outside the panel wrapper, close
        const panel = document.getElementById('ticker-search-panel');
        if (panel && !panel.contains(e.target)) setShowModal(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModal]);

  const handleSelect = (ticker) => {
    // Show displayTicker but return raw symbol to parent
    const sym = (ticker.symbol || ticker.ticker || '').toString().toUpperCase();
    const display = (ticker.displayTicker || ((sym || '').split('.')[0]) || sym).toString();
    setInput(`${ticker.name} (${display})`);
    setShowDropdown(false);
    if (onSelect) onSelect(sym);
  };

  const handleClear = () => {
    setInput('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  const openModal = () => {
    setModalQuery('');
    setShowModal(true);
    // focus will be set via ref after render
    setTimeout(() => modalInputRef.current && modalInputRef.current.focus(), 0);
  };

  // expose imperative open() to parent via ref
  useImperativeHandle(ref, () => ({
    open: () => {
      setModalQuery('');
      setShowModal(true);
      setTimeout(() => modalInputRef.current && modalInputRef.current.focus(), 0);
    }
  }));

  const handleModalSelect = (ticker) => {
    const sym = (ticker.symbol || ticker.ticker || '').toString().toUpperCase();
    const display = (ticker.displayTicker || ((sym || '').split('.')[0]) || sym).toString();
    setInput(`${ticker.name} (${display})`);
    setShowModal(false);
    if (onSelect) onSelect(sym);
  };

  return (
    <div className="ticker-search-container">
      {showInput && (
        <div className="ticker-search-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            readOnly
            className="ticker-search-input"
            placeholder={placeholder}
            value={input}
            onFocus={() => openModal()}
            disabled={loading}
            aria-label="Open ticker search"
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
      )}

      {/* Modal overlay */}
      {showModal && (
        <div className="lc-modal-overlay" role="dialog" aria-modal="true">
          <div className="lc-modal-content lc-ticker-search-modal" id="ticker-search-panel">
            <div className="lc-modal-header">
              <h2>Search Ticker</h2>
              <button className="lc-modal-close" onClick={() => setShowModal(false)} aria-label="Close">✕</button>
            </div>

            <div className="lc-modal-body">
              <div className="lc-ticker-search-input-wrapper">
                <input
                  ref={modalInputRef}
                  className="lc-ticker-search-input"
                  placeholder={placeholder}
                  value={modalQuery}
                  onChange={(e) => setModalQuery(e.target.value)}
                  aria-label="Search tickers"
                />
              </div>

              <div className="lc-ticker-search-list">
                {modalLoading ? (
                  <div className="ticker-search-loading">Searching...</div>
                ) : (
                  (modalResults && modalResults.length) ? (
                    modalResults.slice(0, 400).map((t) => {
                      const symbolText = (t.symbol || t.ticker || '').toString().toUpperCase();
                      const exchangeText = (t.exchange || '').toString();
                      const logoUrl = symbolText ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbolText)}?format=png` : null;
                      const displayTicker = (t.displayTicker || t.display || symbolText).toString();
                      return (
                        <button key={`${symbolText}-${exchangeText}`} type="button" className="lc-ticker-search-item" onClick={() => handleModalSelect(t)}>
                          <div className="lc-ticker-search-item-ticker">
                            {logoUrl ? (
                              <img src={logoUrl} alt={`${symbolText} logo`} className="ticker-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                              <div className="ticker-logo-placeholder" aria-hidden></div>
                            )}
                            <div style={{marginLeft:6, fontWeight:700}}>{displayTicker}</div>
                          </div>
                          <div className="lc-ticker-search-item-name">{t.name}</div>
                          <div className="lc-ticker-search-item-market">{exchangeText}</div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="ticker-search-empty">No results</div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default TickerSearch;
