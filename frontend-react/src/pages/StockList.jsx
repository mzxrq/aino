import React, { useState, useEffect, useRef } from "react";
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from "react-router-dom";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { useAuth } from "../context/useAuth";
import { ViewChartIcon, CompareIcon, CompareDataIcon, FollowIcon, MenuIcon, FavoriteIcon } from "../components/SvgIcons";
import Swal from 'sweetalert2';
import "../css/StockList.css";

echarts.use([LineChart, GridComponent, SVGRenderer]);

// Read API endpoints from Vite environment variables with sensible defaults.
// Common env names supported: VITE_NODE_API_URL, VITE_API_URL for node gateway;
// VITE_LINE_PY_URL or VITE_PY_API_URL for the Python service.
const API_URL = import.meta.env.VITE_NODE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:5050';
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const priceFailCache = new Set(); // avoid re-fetching tickers that already 404'd this session
const logoFailCache = new Set(); // avoid re-fetching logos that already 404'd this session

export default function StockList() {
  const { i18n } = useLingui();
  const { user, token } = useAuth();
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("All");
  const [showMarketDropdown, setShowMarketDropdown] = useState(false);
  const [showRowsDropdown, setShowRowsDropdown] = useState(false);
  const marketButtonRef = useRef(null);
  const rowsButtonRef = useRef(null);
  const [viewMode, setViewMode] = useState("detailed"); // "detailed" or "boxed"

  const [marketData, setMarketData] = useState([]);
  const [favoritesSet, setFavoritesSet] = useState(new Set()); // Track favorited tickers
  const [loading, setLoading] = useState(false);
  // Server-driven pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  
  const navigate = useNavigate();

  // Ensure list page starts at top when entering this route
  useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); }
  }, []);

  // ---------------------------------------------------
  // Initial data fetch
  // ---------------------------------------------------
  useEffect(() => {
    // Initial load: first page
    setPage(1);
    setIsSearching(false);
    fetchMarketData(1, false);
    fetchRecentAnomalies();
    if (user) {
      fetchUserFavorites();
    }
  }, [user]);

  // Reload when market filter changes
  useEffect(() => {
    setPage(1);
    setIsSearching(false);
    fetchMarketData(1, false);
  }, [marketFilter]);

  // Reload when page size changes (table-style control)
  useEffect(() => {
    setPage(1);
    setIsSearching(false);
    fetchMarketData(1, false);
  }, [pageSize]);

  // Reload when sort changes: request server-sorted page when not searching,
  // otherwise re-run the search to apply client-side sort/enrichment.
  useEffect(() => {
    const q = (search || '').trim();
    if (isSearching) {
      if (q.length > 0) {
        // re-run search to refresh results and enrichment
        fetchSearchResults(q);
      } else {
        // fallback to paged list
        setIsSearching(false);
        setPage(1);
        fetchMarketData(1, false);
      }
    } else {
      setPage(1);
      fetchMarketData(1, false);
    }
  }, []);

  // ---------------------------------------------------
  // Debounced search
  // ---------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      // If there's a search term, use search API to get matching tickers (global search)
      const q = (search || '').trim();
      if (q.length === 0) {
        // clear search mode and reload paginated list
        setIsSearching(false);
        setPage(1);
        fetchMarketData(1, false);
      } else {
        setIsSearching(true);
        setPage(1);  // Reset to page 1 when starting new search
        fetchSearchResults(q, 1);  // Pass page 1 to fetchSearchResults
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

const generateSparklineSVG = (closes) => {
  // Lightweight SVG polyline generator — avoids initializing ECharts for every small sparkline
  if (!closes || closes.length < 2) return "";
  try {
    const values = closes.map(Number).filter(v => Number.isFinite(v));
    if (values.length < 2) return "";

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 100;
    const height = 40;

    const points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const isPositive = values[values.length - 1] >= values[0];
    const color = isPositive ? '#2cc17f' : '#e05654';

    return `<svg width="${width}" height="${height}" class="sparkline-svg"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } catch (err) {
    console.error('Sparkline svg generation error:', err);
    return '';
  }
};

const resolveYfTicker = (ticker, country) => {
  const hasSuffix = ticker.includes('.');
  if (hasSuffix) return ticker;
  if (country === 'TH') return `${ticker}.BK`;
  if (country === 'JP') return `${ticker}.T`;
  return ticker;
};

  // Which sort keys should be performed server-side (map UI key -> DB field)
  const serverSortable = { alphabetical: 'companyName', company: 'companyName', exchange: 'primaryExchange' };

  const locale = (i18n?.locale || 'en').toLowerCase();
  const localePrefix = locale.split('-')[0];
  const localizedName = (item) => {
    const hasLocal = item.companyNameLocal && item.companyNameLocal.trim();
    const isJa = localePrefix === 'ja' || localePrefix === 'jp';
    const isTh = localePrefix === 'th';
    const country = (item.country || '').toUpperCase();
    if (hasLocal) {
      if (isJa && (country === 'JP' || item.ticker.endsWith('.T'))) return item.companyNameLocal.trim();
      if (isTh && (country === 'TH' || item.ticker.endsWith('.BK'))) return item.companyNameLocal.trim();
    }
    return item.companyName;
  };

// Concurrency control helper: execute async tasks with max N parallel
const executeWithConcurrency = async (tasks, maxConcurrent = 5) => {
  const results = [];
  const executing = [];
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).then(
      res => results.push({ status: 'ok', data: res }),
      err => results.push({ status: 'error', error: err })
    );
    executing.push(p);
    
    if (executing.length >= maxConcurrent) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(ep => ep === p), 1);
    }
  }
  
  await Promise.all(executing);
  return results;
};

const fetchChartDataForSparkline = async (ticker, country) => {
  try {
    const yfTicker = resolveYfTicker(ticker, country);
    // Call the cache route that accepts path params: /node/cache/ticker/:ticker/:interval/:period
    const interval = '1d';
    const period = '1mo';
    const res = await fetch(`${API_URL}/node/cache/ticker/${encodeURIComponent(yfTicker)}/${encodeURIComponent(interval)}/${encodeURIComponent(period)}`);
    if (!res.ok) return "";
    const json = await res.json();
    const list = json && json.data ? json.data : [];
    if (Array.isArray(list) && list.length > 0) {
      // pick the most recent cache entry (last updated)
      const entry = list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];
      const values = entry.values || entry.sparkline || entry.close || entry.data || [];
      if (Array.isArray(values) && values.length >= 2) {
        return generateSparklineSVG(values);
      }
    }
  } catch (err) {
    console.error(`Error fetching sparkline for ${ticker}:`, err);
  }
  return "";
};

const fetchBulkPriceData = async (items) => {
  if (!items || items.length === 0) return {};

  try {
    // Resolve all tickers with proper suffixes
    const tickersToFetch = items.map(item => resolveYfTicker(item.ticker, item.country));
    
    // Make bulk request with 1mo/1d for fast daily data
    const res = await fetch(`${API_URL}/node/price/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: tickersToFetch,
        period: '1mo',
        interval: '1d'
      })
    });
    
    if (!res.ok) return {};
    const data = await res.json();
    
    if (data.success && data.results) {
      // Map resolved tickers back to base tickers
      const priceMap = {};
      items.forEach((item, idx) => {
        const resolvedTicker = tickersToFetch[idx];
        const priceData = data.results[resolvedTicker];
        if (priceData) {
          priceMap[item.ticker] = priceData;
        }
      });
      return priceMap;
    }
  } catch (err) {
    console.error('Error fetching bulk prices:', err);
  }
  return {};
};

// Fetch price for a single ticker (fallback to per-ticker endpoint)
const fetchSinglePrice = async (item) => {
  try {
    // Skip if this ticker already 404'd to avoid repeated network noise
    if (priceFailCache.has(item.ticker)) return { ticker: item.ticker, data: null };

    const resolvedTicker = resolveYfTicker(item.ticker, item.country);
    const res = await fetch(`${API_URL}/node/price/${encodeURIComponent(resolvedTicker)}?period=1mo&interval=1d`);
    if (!res.ok) {
      if (res.status === 404) priceFailCache.add(item.ticker);
      return { ticker: item.ticker, data: null };
    }
    const json = await res.json();
    if (json && json.success) return { ticker: item.ticker, data: json };
    return { ticker: item.ticker, data: null };
  } catch (err) {
    return { ticker: item.ticker, data: null };
  }
};

const fetchSearchResults = async (q, pageToLoad = 1) => {
  try {
    // Use page-based pagination like marketlists endpoint
    const res = await fetch(`${API_URL}/node/search?q=${encodeURIComponent(q)}&page=${pageToLoad}&pageSize=${pageSize}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.results)) {
      setMarketData([]);
      setTotalPages(1);
      setTotalCount(0);
      return;
    }

    // INSTANT RESULTS - Map basic search results immediately
    const items = json.results.map(r => ({
      _id: r.symbol,
      ticker: r.symbol,
      companyName: r.name || r.symbol,
      companyNameLocal: r.companyNameLocal || '',
      country: r.country || 'US',
      primaryExchange: r.exchange || '',
      sectorGroup: '',
      logo: '',
      hideLogo: true,
      sparklineSvg: ''
    }));
    
    // Use backend total when available for accurate pagination; fallback to hasMore heuristic
    const totalFromApi = typeof json.total === 'number' ? json.total : null;
    const totalCountValue = totalFromApi != null
      ? json.total
      : (json.hasMore ? (pageToLoad * pageSize) + 1 : items.length);
    const totalPagesValue = totalFromApi != null
      ? Math.max(1, Math.ceil(json.total / pageSize))
      : (json.hasMore ? pageToLoad + 1 : pageToLoad);
    
    setMarketData(items);
    setTotalPages(totalPagesValue);
    setTotalCount(totalCountValue);
    setPage(pageToLoad);
  } catch (err) {
    console.error('Search error:', err);
    setMarketData([]);
  }
};

const fetchMarketData = async (pageToLoad = 1, append = false) => {
  if (!pageToLoad || pageToLoad < 1) pageToLoad = 1;
  setLoading(true);

  try {
    const countryParam = marketFilter && marketFilter !== 'All' ? `&country=${encodeURIComponent(marketFilter)}` : '';
    
    // Use default ticker asc sort for deterministic pagination
    const serverSortParam = `&sortBy=ticker&sortOrder=asc`;
    
    const res = await fetch(`${API_URL}/node/marketlists?page=${pageToLoad}&pageSize=${pageSize}${countryParam}${serverSortParam}`);
    const json = await res.json();
    const rawList = Array.isArray(json) ? json : json.data || [];

    let list = rawList
      .filter(it => {
        // Filter out indices (not actual stocks)
        const exchange = it.primaryExchange || it["Primary Exchange"] || "";
        return exchange !== "Index";
      })
      .map(it => {
        const ticker = it.ticker || it.Ticker || "";
        const companyName = it.companyName || it.name || ticker;
        const companyNameLocal = it.companyNameLocal || '';
        const country = it.country || it.Country || "US";
        
        // Skip logos for tickers known to not have parqet images
        const skipLogoTickers = [
          'BJC.BK', 'OSP.BK', 'RJH.BK', '9522.T',
          // JP tickers without logos (existing list)
          '1811.T', '1788.T', '1783.T', '1793.T', '1810.T', '1799.T', '1762.T', '1798.T', '1814.T', '182A.T', '181A.T', '1821.T',
          '1773.T', '1826.T', '1764.T', '1786.T', '176A.T', '1848.T', '1776.T', '1807.T', '177A.T', '1822.T', '179A.T', '1840.T',
          '175A.T', '183A.T', '1820.T', '1828.T', '1827.T', '1835.T', '1844.T', '1795.T', '1847.T', '1841.T', '180A.T',
          // Additional JP tickers observed producing 404s (include both base and .T forms to ensure match)
          '1305', '1305.T','1306','1306.T','1308','1308.T','1309','1309.T','130A','130A.T',
          '1311','1311.T','1319','1319.T','1320','1320.T','1321','1321.T','1322','1322.T',
          '1325','1325.T','1326','1326.T','1328','1328.T','1329','1329.T','133A','133A.T',
          '1343','1343.T','1345','1345.T','1346','1346.T','1348','1348.T','1349','1349.T',
          '1356','1356.T','1357','1357.T','1358','1358.T','1360','1360.T','1364','1364.T',
          '1365','1365.T','1366','1366.T','1367','1367.T','1368','1368.T','1369','1369.T','136A','136A.T',
          '1376','1376.T','1377','1377.T','1379','1379.T','137A','137A.T','1380','1380.T',
          '1381','1381.T','1382','1382.T','1383','1383.T','1384','1384.T','138A','138A.T'
        ];
        // Only skip if we've already seen a 404 for this ticker or it is in a known bad list.
        const shouldSkipLogo = logoFailCache.has(ticker) || skipLogoTickers.some(skip => {
          if (country === 'JP' && !ticker.includes('.')) {
            return ticker === skip;
          }
          return skipLogoTickers.includes(ticker) || skipLogoTickers.includes(`${ticker}.BK`) || skipLogoTickers.includes(`${ticker}.T`);
        });
        
        // Add .BK suffix for Thai stocks for logo API
        const logoTicker = country === "TH" && !ticker.includes(".BK") ? `${ticker}.BK` : ticker;
        
        return {
          _id: it._id,
          ticker: ticker,
          companyName: companyName,
          companyNameLocal: companyNameLocal,
          primaryExchange: it.primaryExchange || it["Primary Exchange"] || "",
          sectorGroup: it.sectorGroup || it.sector || "",
          country: country,
          // Use local logo files stored in public/logos/
          logo: `/logos/${encodeURIComponent(logoTicker)}.png`,
          hideLogo: false,
          sparklineSvg: "",
        };
      });

    // Update pagination metadata from server response
    try {
      if (json.total !== undefined) setTotalCount(json.total);
      if (json.totalPages !== undefined) setTotalPages(json.totalPages);
      setPage(pageToLoad);
    } catch (e) {}

    // SHOW DATA IMMEDIATELY - NO PRICE/SPARKLINE FETCHING ON LOAD
    setMarketData(list);
  } catch (err) {
    console.error("Error fetching market list:", err);
  }
  setLoading(false);
};

const fetchRecentAnomalies = async () => {
  try {
    // Fetch count summary for all markets; then get detail per market
    const anomaliesData = {};
    
    // Get summary for current filter market or all
    const market = marketFilter === "All" ? "" : marketFilter;
    const url = market 
      ? `${API_URL}/node/anomalies/summary?market=${market}`
      : `${API_URL}/node/anomalies/summary`;
    
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.success && json.byTicker && Array.isArray(json.byTicker)) {
      json.byTicker.forEach(item => {
        anomaliesData[item.ticker] = {
          count: item.count,
          lastDetected: new Date(), // Use current time; for detail use /recent
          latestPrice: null
        };
      });
    }
    
    setAnomaliesMap(anomaliesData);
  } catch (err) {
    console.error("Error fetching recent anomalies:", err);
  }
};

const fetchUserFavorites = async () => {
  if (!user || !token) return;

  try {
    const res = await fetch(`${API_URL}/node/favorites`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    const json = await res.json();
    
    if (json.success && Array.isArray(json.data)) {
      const favSet = new Set(json.data.map(f => f.ticker.toUpperCase()));
      setFavoritesSet(favSet);
    }
  } catch (err) {
    console.error("Error fetching favorites:", err);
  }
};

// Format price with currency based on market country
const formatPriceByMarket = (price, country) => {
  if (price == null || Number.isNaN(price)) return "-";
  const currency = country === "JP" ? "JPY" : country === "TH" ? "THB" : "USD";
  const minimumFractionDigits = currency === "JPY" ? 0 : 2;
  const maximumFractionDigits = currency === "JPY" ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(price);
  } catch (e) {
    return `${currency} ${price.toFixed(minimumFractionDigits)}`;
  }
};

const toggleFavorite = async (ticker) => {
  if (!user || !token) {
    alert("Please log in to use favorites");
    return;
  }

  try {
    const isFav = favoritesSet.has(ticker.toUpperCase());
    
    if (isFav) {
      // Remove favorite
      const res = await fetch(`${API_URL}/node/favorites/${encodeURIComponent(ticker)}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      const json = await res.json();
      
      if (json.success) {
        setFavoritesSet(prev => {
          const newSet = new Set(prev);
          newSet.delete(ticker.toUpperCase());
          return newSet;
        });
      }
    } else {
      // Add favorite
      const res = await fetch(`${API_URL}/node/favorites`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticker, market: "US" }),
      });
      const json = await res.json();
      
      if (json.success) {
        setFavoritesSet(prev => new Set(prev).add(ticker.toUpperCase()));
      }
    }
  } catch (err) {
    console.error("Error toggling favorite:", err);
  }
};

const toggleFollow = async (ticker) => {
  if (!user || !token) {
    await Swal.fire({
      icon: 'info',
      title: i18n._('Please Login'),
      text: i18n._('You need to be signed in to follow tickers.'),
      confirmButtonColor: '#00aaff'
    });
    return;
  }

  try {
    const res = await fetch(`${API_URL}/node/subscribers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticker }),
    });
    const json = await res.json();
    
    if (json.success) {
      await Swal.fire({
        icon: 'success',
        title: i18n._('Following'),
        text: i18n._t(`Now following ${ticker}`),
        timer: 1500,
        confirmButtonColor: '#00aaff'
      });
    }
  } catch (err) {
    console.error("Error following stock:", err);
  }
};

  const handleLogoError = (ticker) => {
    // When a remote logo 404s, mark the item to hide logo so we don't request it again
    setMarketData(prev => prev.map(it => (it.ticker === ticker ? { ...it, hideLogo: true, logo: '' } : it)));
  };


  // Market status helper with real-time detection
  const isMarketOpen = (country, ticker) => {
    const now = new Date();
    
    // Get day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = now.getUTCDay();
    
    // Check if weekend
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (country === "US") {
      if (isWeekend) return false;
      
      // Convert current time to US Eastern Time
      const usTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const usHours = usTime.getHours();
      const usMinutes = usTime.getMinutes();
      const usTimeMinutes = usHours * 60 + usMinutes;
      
      // US markets: 9:30 AM - 4:00 PM ET
      const marketOpen = 9 * 60 + 30;  // 9:30 AM
      const marketClose = 16 * 60;      // 4:00 PM
      
      return usTimeMinutes >= marketOpen && usTimeMinutes < marketClose;
    }

    if (country === "JP") {
      if (isWeekend) return false;
      
      // Convert to Japan Standard Time
      const jpTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const jpHours = jpTime.getHours();
      const jpMinutes = jpTime.getMinutes();
      const jpTimeMinutes = jpHours * 60 + jpMinutes;
      
      // Japan markets: 9:00 AM - 3:00 PM JST (with lunch break 11:30-12:30)
      const morningOpen = 9 * 60;      // 9:00 AM
      const morningClose = 11 * 60 + 30; // 11:30 AM
      const afternoonOpen = 12 * 60 + 30; // 12:30 PM
      const afternoonClose = 15 * 60;    // 3:00 PM
      
      return (jpTimeMinutes >= morningOpen && jpTimeMinutes < morningClose) ||
             (jpTimeMinutes >= afternoonOpen && jpTimeMinutes < afternoonClose);
    }

    if (country === "TH") {
      if (isWeekend) return false;
      
      // Convert to Thailand time (ICT = UTC+7)
      const thTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const thHours = thTime.getHours();
      const thMinutes = thTime.getMinutes();
      const thTimeMinutes = thHours * 60 + thMinutes;
      
      // Thailand markets: 10:00 AM - 4:40 PM ICT (with lunch break 12:30-14:30)
      const morningOpen = 10 * 60;        // 10:00 AM
      const morningClose = 12 * 60 + 30;  // 12:30 PM
      const afternoonOpen = 14 * 60 + 30; // 2:30 PM
      const afternoonClose = 16 * 60 + 40; // 4:40 PM
      
      return (thTimeMinutes >= morningOpen && thTimeMinutes < morningClose) ||
             (thTimeMinutes >= afternoonOpen && thTimeMinutes < afternoonClose);
    }

    return false;
  };

  // NO CLIENT-SIDE FILTERING OR SORTING - Server handles everything
  const visibleData = marketData;

  // Pagination handlers
  const goPrev = () => {
    if (page > 1) {
      const newPage = page - 1;
      if (isSearching) {
        const q = (search || '').trim();
        fetchSearchResults(q, newPage);
      } else {
        fetchMarketData(newPage, false);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goNext = () => {
    if (page < totalPages) {
      const newPage = page + 1;
      if (isSearching) {
        const q = (search || '').trim();
        fetchSearchResults(q, newPage);
      } else {
        fetchMarketData(newPage, false);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="market-list-page">
      {/* SEARCH BAR */}
      <div className="search-panel">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={i18n.t("Search ticker or company name...")}
          className="market-search-input"
        />
      </div>

      {/* FILTERS ROW */}
      <div className="filters-row">
        <div className="filter-group">
          <label className="filter-label"><Trans>Market</Trans></label>
          <div className="fancy-dropdown">
            <button
              ref={marketButtonRef}
              className="fancy-dropdown-button"
              onClick={() => setShowMarketDropdown(!showMarketDropdown)}
            >
              {marketFilter === 'All' && <span><Trans>All Markets</Trans></span>}
              {marketFilter === 'US' && <span><img src="/flags/us.svg" alt="US" className="flag-icon" /> <Trans>US (NYSE/NASDAQ)</Trans></span>}
              {marketFilter === 'JP' && <span><img src="/flags/japan.svg" alt="JP" className="flag-icon" /> <Trans>Japan (TSE)</Trans></span>}
              {marketFilter === 'TH' && <span><img src="/flags/thai.svg" alt="TH" className="flag-icon" /> <Trans>Thailand (SET)</Trans></span>}
              <span className="dropdown-arrow">{showMarketDropdown ? '▲' : '▼'}</span>
            </button>
            {showMarketDropdown && (
              <div className="fancy-dropdown-menu">
                <div
                  className={`fancy-dropdown-item ${marketFilter === 'All' ? 'active' : ''}`}
                  onClick={() => { setMarketFilter('All'); setShowMarketDropdown(false); }}
                >
                  <Trans>All Markets</Trans>
                </div>
                <div
                  className={`fancy-dropdown-item ${marketFilter === 'US' ? 'active' : ''}`}
                  onClick={() => { setMarketFilter('US'); setShowMarketDropdown(false); }}
                >
                  <img src="/flags/us.svg" alt="US" className="flag-icon" /> <Trans>US (NYSE/NASDAQ)</Trans>
                </div>
                <div
                  className={`fancy-dropdown-item ${marketFilter === 'JP' ? 'active' : ''}`}
                  onClick={() => { setMarketFilter('JP'); setShowMarketDropdown(false); }}
                >
                  <img src="/flags/japan.svg" alt="JP" className="flag-icon" /> <Trans>Japan (TSE)</Trans>
                </div>
                <div
                  className={`fancy-dropdown-item ${marketFilter === 'TH' ? 'active' : ''}`}
                  onClick={() => { setMarketFilter('TH'); setShowMarketDropdown(false); }}
                >
                  <img src="/flags/thai.svg" alt="TH" className="flag-icon" /> <Trans>Thailand (SET)</Trans>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="filter-group compact">
          <label className="filter-label"><Trans>Rows</Trans></label>
          <div className="fancy-dropdown">
            <button
              ref={rowsButtonRef}
              className="fancy-dropdown-button"
              onClick={() => setShowRowsDropdown(!showRowsDropdown)}
            >
              <span>{pageSize}</span>
              <span className="dropdown-arrow">{showRowsDropdown ? '▲' : '▼'}</span>
            </button>
            {showRowsDropdown && (
              <div className="fancy-dropdown-menu">
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <div
                    key={opt}
                    className={`fancy-dropdown-item ${pageSize === opt ? 'active' : ''}`}
                    onClick={() => { setPageSize(opt); setShowRowsDropdown(false); }}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="results-count">
          <Trans>Page {page} / {totalPages} · {visibleData.length} shown of {totalCount}</Trans>
        </div>
      </div>

      {/* STOCK CARDS */}
      <div className="market-list-container">
        {loading && page === 1 ? (
          <div className="loading-state"><Trans>Loading...</Trans></div>
        ) : visibleData.length > 0 ? (
          viewMode === "detailed" ? (
            visibleData.map((item) => {
              const marketOpen = isMarketOpen(item.country, item.ticker);
              const displayName = localizedName(item);
              return (
                <div 
                  key={item._id || item.ticker} 
                  className="stock-card stock-card-detailed"
                  onClick={() => navigate(`/chart/u/${item.ticker}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="stock-card-header">
                    <div className="stock-logo-section">
                      <div className="stock-logo-badge">
                        {item.logo && !item.hideLogo && !logoFailCache.has(item.ticker) ? (
                          <img 
                            src={item.logo} 
                            alt={item.ticker}
                            className="stock-logo"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.target.onerror = null;
                              logoFailCache.add(item.ticker);
                              handleLogoError(item.ticker);
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : null}
                        {(!item.logo || item.hideLogo || logoFailCache.has(item.ticker)) && (
                          <img 
                            src="/no-logo.svg" 
                            alt="No logo"
                            className="stock-logo-fallback"
                          />
                        )}
                      </div>
                      <div className="stock-info">
                        <div className="stock-ticker-row">
                          <h3 className="stock-ticker">{item.ticker} <span className="stock-exchange">({item.primaryExchange})</span></h3>
                          {marketOpen && <span className="status-badge open"><Trans>● Open</Trans></span>}
                          {!marketOpen && <span className="status-badge closed"><Trans>○ Closed</Trans></span>}
                        </div>
                        <p className="stock-name">{displayName}</p>
                      </div>
                    </div>

                    <div className="stock-actions">
                      <button className="action-icon" title="View Chart" onClick={(e) => { e.stopPropagation(); navigate(`/chart/u/${item.ticker}`); }}>
                        <ViewChartIcon />
                      </button>
                      <button className="action-icon" title="Compare" onClick={(e) => { e.stopPropagation(); navigate(`/chart?ticker=${item.ticker}`); }}>
                        <CompareIcon />
                      </button>
                      <button className="action-icon follow-btn" title="Follow" onClick={(e) => { e.stopPropagation(); toggleFollow(item.ticker); }}>
                        <FollowIcon />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : 
            visibleData.map((item) => {
              const displayName = localizedName(item);
              return (
                <div 
                  key={item._id || item.ticker} 
                  className="stock-card stock-card-boxed"
                  onClick={() => navigate(`/chart/u/${item.ticker}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="box-logo-section">
                    <div className="box-logo-badge">
                      {item.logo && !item.hideLogo ? (
                        <img 
                          src={item.logo} 
                          alt={item.ticker}
                          className="box-logo"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : null}
                      {(!item.logo || item.hideLogo) && (
                        <img 
                          src="/no-logo.svg" 
                          alt="No logo"
                          className="box-logo-fallback"
                        />
                      )}
                    </div>
                  </div>

                  <div className="box-info-section">
                    <h4 className="box-ticker">{item.ticker} <span className="stock-exchange">({item.primaryExchange})</span></h4>
                    <p className="box-name">{displayName}</p>
                  </div>

                  <div className="box-actions">
                    <button className="box-follow-btn" onClick={(e) => { e.stopPropagation(); toggleFollow(item.ticker); }}>
                      <Trans>+ Follow</Trans>
                    </button>
                  </div>
                </div>
              );
            }
          )
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3><Trans>No stocks found</Trans></h3>
            <p><Trans>Try adjusting your search or filters</Trans></p>
          </div>
        )}
      </div>
      {/* Sentinel for infinite scroll + load more fallback */}
      <div className="marketlist-load-more">
        {!isSearching && (
          <div className="pagination-controls">
            <button className="pagination-btn prev-btn" onClick={goPrev} disabled={page <= 1 || loading}>
              <Trans>‹ Prev</Trans>
            </button>
            <div className="page-indicator"><Trans>Page {page} of {totalPages}</Trans></div>
            <button className="pagination-btn next-btn" onClick={goNext} disabled={page >= totalPages || loading}>
              <Trans>Next ›</Trans>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
