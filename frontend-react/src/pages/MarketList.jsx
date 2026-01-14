import React, { useState, useEffect, useRef } from "react";
import { Trans } from '@lingui/react/macro';
import { useNavigate } from "react-router-dom";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { useAuth } from "../context/useAuth";
import { ViewChartIcon, CompareIcon, CompareDataIcon, FollowIcon, MenuIcon, FavoriteIcon } from "../components/SvgIcons";
import "../css/MarketList.css";

echarts.use([LineChart, GridComponent, SVGRenderer]);

// Read API endpoints from Vite environment variables with sensible defaults.
// Common env names supported: VITE_NODE_API_URL, VITE_API_URL for node gateway;
// VITE_LINE_PY_URL or VITE_PY_API_URL for the Python service.
const API_URL = import.meta.env.VITE_NODE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:5050';
const PY_API_URL = import.meta.env.VITE_LINE_PY_URL || import.meta.env.VITE_PY_API_URL || 'http://localhost:5000';
let bulkSparklineUnsupported = false; // remember if bulk endpoint 404s

export default function MarketListScreen() {
  const { user, token } = useAuth();
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("All");
  const [sortBy, setSortBy] = useState("recent_anomalies");
  const [marketStatus, setMarketStatus] = useState("all");
  const [viewMode, setViewMode] = useState("detailed"); // "detailed" or "boxed"

  const [marketData, setMarketData] = useState([]);
  const [anomaliesMap, setAnomaliesMap] = useState({});
  const [pricesMap, setPricesMap] = useState({});
  const [favoritesSet, setFavoritesSet] = useState(new Set()); // Track favorited tickers
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 5;
  // Server-driven pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  
  const navigate = useNavigate();

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

  // Reload when market filter or status changes
  useEffect(() => {
    setPage(1);
    setIsSearching(false);
    fetchMarketData(1, false);
  }, [marketFilter, marketStatus]);

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
  }, [sortBy]);

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
        fetchSearchResults(q);
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
    const resolvedTicker = resolveYfTicker(item.ticker, item.country);
    const res = await fetch(`${API_URL}/node/price/${encodeURIComponent(resolvedTicker)}?period=1mo&interval=1d`);
    if (!res.ok) return { ticker: item.ticker, data: null };
    const json = await res.json();
    if (json && json.success) return { ticker: item.ticker, data: json };
    return { ticker: item.ticker, data: null };
  } catch (err) {
    return { ticker: item.ticker, data: null };
  }
};

const fetchSearchResults = async (q) => {
  try {
    const res = await fetch(`${API_URL}/node/search?q=${encodeURIComponent(q)}&limit=50`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.results)) {
      setMarketData([]);
      return;
    }

    // For each search result, attempt to fetch marketlist details for richer data
    const results = json.results;
    const tasks = results.map(r => async () => {
      try {
        const rr = await fetch(`${API_URL}/node/marketlists/ticker/${encodeURIComponent(r.symbol)}`);
        if (!rr.ok) return null;
        const j = await rr.json();
        return j.data || null;
      } catch (e) {
        return null;
      }
    });

    const settled = await executeWithConcurrency(tasks, 5);
    const filtered = settled.filter(s => s.status === 'ok' && s.data).map(s => s.data);
    // Fallback: if none resolved, map basic search results
    const final = filtered.length > 0 ? filtered : results.map(r => ({ ticker: r.symbol, companyName: r.name, country: r.exchange, primaryExchange: r.exchange }));

    // PRIORITY: show basic search results immediately, then enrich with prices and sparklines
    // Build minimal items
    const items = final.map(it => ({
      _id: it._id || it.ticker,
      ticker: it.ticker,
      companyName: it.companyName || it.name || it.ticker,
      country: it.country || 'US',
      primaryExchange: it.primaryExchange || it.exchange || '',
      sectorGroup: it.sectorGroup || it.sector || '',
      logo: '',
      hideLogo: false,
      sparklineSvg: ''
    }));
    // Show basic items immediately so user sees results
    setMarketData(items);
    setTotalPages(1);
    setTotalCount(items.length);
    setPage(1);

    // Enrich in background: try bulk prices, per-ticker fallback, then sparklines
    (async () => {
      try {
        let priceMap = {};
        try { priceMap = await fetchBulkPriceData(items); } catch (e) { priceMap = {}; }
        const missingPrices = items.filter(it => !priceMap[it.ticker]);
        if (missingPrices.length > 0) {
          const priceTasks = missingPrices.map(it => async () => await fetchSinglePrice(it));
          const priceResults = await executeWithConcurrency(priceTasks, 10);
          priceResults.forEach(r => {
            if (r.status === 'ok' && r.data && r.data.data) {
              priceMap[r.data.ticker] = r.data.data;
            }
          });
        }
        setPricesMap(priceMap);

        const sparkTasks = items.map(it => async () => {
          const svg = await fetchChartDataForSparkline(it.ticker, it.country);
          return { ticker: it.ticker, svg };
        });
        const sparkResults = await executeWithConcurrency(sparkTasks, 10);
        const sparklineMap = {};
        sparkResults.forEach(r => {
          if (r.status === 'ok' && r.data && r.data.svg) sparklineMap[r.data.ticker] = r.data.svg;
        });

        setMarketData(prev => prev.map(it => ({ ...it, sparklineSvg: sparklineMap[it.ticker] || it.sparklineSvg || '' })));
      } catch (e) {
        console.warn('Search enrichment failed:', e);
      }
    })();
  } catch (err) {
    console.error('Search error:', err);
    setMarketData([]);
  }
};

const fetchMarketData = async (pageToLoad = 1, append = false) => {
  if (!pageToLoad || pageToLoad < 1) pageToLoad = 1;
  // unify loading state for both replace and append operations
  setLoading(true);

  try {
    const countryParam = marketFilter && marketFilter !== 'All' ? `&country=${encodeURIComponent(marketFilter)}` : '';
    const statusParam = marketStatus && marketStatus !== 'all' ? `&status=${encodeURIComponent(marketStatus)}` : '';
    // Ask server to sort for certain UI selections so pagination reflects global order
    let serverSortParam = '';
    if (serverSortable[sortBy]) {
      const field = serverSortable[sortBy];
      serverSortParam = `&sortBy=${encodeURIComponent(field)}&sortOrder=asc`;
    }
    const res = await fetch(`${API_URL}/node/marketlists?page=${pageToLoad}&pageSize=${pageSize}${countryParam}${statusParam}${serverSortParam}`);
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
        const shouldSkipLogo = skipLogoTickers.some(skip => {
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
          primaryExchange: it.primaryExchange || it["Primary Exchange"] || "",
          sectorGroup: it.sectorGroup || it.sector || "",
          country: country,
          // If shouldSkipLogo is true we set `hideLogo` so UI won't render the external request or a fallback
          logo: (!shouldSkipLogo && logoTicker) ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(logoTicker)}?format=png` : "",
          hideLogo: !!shouldSkipLogo,
          sparklineSvg: "",
        };
      });

    // Update pagination metadata from server response
    try {
      if (json.total !== undefined) setTotalCount(json.total);
      if (json.totalPages !== undefined) setTotalPages(json.totalPages);
      setPage(pageToLoad);
    } catch (e) {}

    // Merge with previously loaded pages when appending
    const mergedList = append ? [...marketData, ...list] : list;
    list = mergedList;

    // Try to fetch all pre-cached sparklines from bulk endpoint (skip if previously unsupported)
    let sparklineMap = {};
    if (!bulkSparklineUnsupported) {
      try {
        const sparklineRes = await fetch(`${API_URL}/node/cache/sparklines/all`);
        if (sparklineRes.ok) {
          const sparklineData = await sparklineRes.json();
          if (sparklineData.success && Array.isArray(sparklineData.data)) {
            const generateSvg = (closeArray) => {
              if (!closeArray || closeArray.length < 2) return "";
              const min = Math.min(...closeArray);
              const max = Math.max(...closeArray);
              const range = max - min || 1;
              const width = 100, height = 40;
              const points = closeArray.map((val, i) => {
                const x = (i / (closeArray.length - 1)) * width;
                const y = height - ((val - min) / range) * height;
                return `${x},${y}`;
              }).join(' ');
              const isPositive = closeArray[closeArray.length - 1] >= closeArray[0];
              const color = isPositive ? '#2cc17f' : '#e05654';
              return `<svg width="${width}" height="${height}" class="sparkline-svg"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            };
            sparklineData.data.forEach(item => {
              const values = item.close || item.sparkline || item.values || item.data || [];
              if (item.ticker && Array.isArray(values) && values.length >= 2) {
                sparklineMap[item.ticker] = generateSvg(values);
              }
            });
          }
        } else if (sparklineRes.status === 404) {
          bulkSparklineUnsupported = true; // avoid retrying each render if route missing
        }
      } catch (err) {
        console.warn("Failed to fetch pre-cached sparklines, falling back to on-demand:", err);
      }
    }

    // On-demand fetch for uncached sparklines is now lazy (see effect below)
    
    // Fetch prices ticker-by-ticker with limited concurrency to avoid large bulk requests
    let allPriceData = {};
    try {
      const priceTasks = list.map(item => async () => await fetchSinglePrice(item));
      // Increase concurrency for per-ticker price fetch to reduce wall-clock time for each page
      const priceResults = await executeWithConcurrency(priceTasks, 10); // max 10 parallel
      priceResults.forEach(r => {
        if (r.status === 'ok' && r.data && r.data.data) {
          // `fetchSinglePrice` returns { ticker, data }
          const ticker = r.data.ticker;
          const pdata = r.data.data;
          if (pdata && pdata.success) allPriceData[ticker] = pdata;
        }
      });
    } catch (e) {
      console.warn('Per-ticker price fetch failed, falling back to bulk:', e);
      // fallback to previous bulk behavior in case of unexpected failure
      const BATCH_SIZE = 30;
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE);
        try {
          const bulk = await fetchBulkPriceData(batch);
          allPriceData = { ...allPriceData, ...bulk };
        } catch (err) { /* ignore */ }
      }
    }
    
    list = list.map(item => ({
      ...item,
      sparklineSvg: sparklineMap[item.ticker] || ""
    }));
    
    setPricesMap(allPriceData);

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
    alert("Please log in to follow stocks");
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
      alert(`Now following ${ticker}`);
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

  // Filtering
  const filteredData = marketData.filter((item) => {
    // Search filter (ticker or company name)
    const searchLower = search.toLowerCase();
    const matchSearch = search.trim() === "" ||
      item.ticker.toLowerCase().includes(searchLower) ||
      item.companyName.toLowerCase().includes(searchLower);

    // Market filter
    const matchMarket = marketFilter === "All" || item.country === marketFilter;

    // Market status filter
    if (marketStatus === "open" && !isMarketOpen(item.country)) return false;
    if (marketStatus === "closed" && isMarketOpen(item.country)) return false;

    return matchSearch && matchMarket;
  });

  // Sorting: skip client-side resort when server provided a global sort
  const sortedData = serverSortable[sortBy]
    ? [...filteredData]
    : [...filteredData].sort((a, b) => {
    const aAnomalies = anomaliesMap[a.ticker] || { count: 0, lastDetected: null, latestPrice: 0 };
    const bAnomalies = anomaliesMap[b.ticker] || { count: 0, lastDetected: null, latestPrice: 0 };
    const aPriceData = pricesMap[a.ticker] || {};
    const bPriceData = pricesMap[b.ticker] || {};

    if (sortBy === "recent_anomalies") {
      // Sort by most recent anomaly detection
      if (!aAnomalies.lastDetected && !bAnomalies.lastDetected) return 0;
      if (!aAnomalies.lastDetected) return 1;
      if (!bAnomalies.lastDetected) return -1;
      return bAnomalies.lastDetected - aAnomalies.lastDetected;
    }

    if (sortBy === "price_low") {
      // Sort by price low to high
      const aPrice = aAnomalies.latestPrice || aPriceData.currentPrice || 0;
      const bPrice = bAnomalies.latestPrice || bPriceData.currentPrice || 0;
      if (aPrice === 0 && bPrice === 0) return 0;
      if (aPrice === 0) return 1;
      if (bPrice === 0) return -1;
      return aPrice - bPrice;
    }

    if (sortBy === "price_high") {
      // Sort by price high to low
      const aPrice = aAnomalies.latestPrice || aPriceData.currentPrice || 0;
      const bPrice = bAnomalies.latestPrice || bPriceData.currentPrice || 0;
      return bPrice - aPrice;
    }

    if (sortBy === "percent_change_high") {
      // Sort by percentage change high to low (biggest gains first)
      const aPercent = aPriceData.percentChange || 0;
      const bPercent = bPriceData.percentChange || 0;
      return bPercent - aPercent;
    }

    if (sortBy === "percent_change_low") {
      // Sort by percentage change low to high (biggest losses first)
      const aPercent = aPriceData.percentChange || 0;
      const bPercent = bPriceData.percentChange || 0;
      return aPercent - bPercent;
    }

    if (sortBy === "anomaly_count") {
      // Sort by anomaly count
      return bAnomalies.count - aAnomalies.count;
    }

    // Default: alphabetical
    return (a.ticker || "").localeCompare(b.ticker || "");
  });

  // Visible data (server-driven paginated results)
  const visibleData = sortedData;

  // Lazy-load sparklines for currently visible items (and a small buffer)
  useEffect(() => {
    const loadVisibleSparklines = async () => {
      if (visibleData.length === 0) return;

      // Buffer ahead to reduce pop-in during scroll
      const BUFFER = 50;
      const loadedCount = marketData.length;
      const target = sortedData.slice(0, Math.min(loadedCount + BUFFER, sortedData.length));

      const missing = target.filter(item => !item.sparklineSvg);
      if (missing.length === 0) return;

      const tasks = missing.map(item => () =>
        fetchChartDataForSparkline(item.ticker, item.country).then(svg => ({ baseTicker: item.ticker, svg }))
      );

      const results = await executeWithConcurrency(tasks, 5);

      if (results.length > 0) {
        setMarketData(prev => prev.map(it => {
          const found = results.find(r => r.status === 'ok' && r.data && r.data.baseTicker === it.ticker);
          if (found && found.data?.svg) {
            return { ...it, sparklineSvg: found.data.svg };
          }
          return it;
        }));
      }
    };

    loadVisibleSparklines();
  }, [marketData.length, sortedData]);

  // loadMore removed — pagination via Prev/Next buttons only

  const goPrev = () => {
    if (isSearching) return;
    if (page > 1 && !loading) {
      fetchMarketData(page - 1, false);
    }
  };

  const goNext = () => {
    if (isSearching) return;
    if (page < totalPages && !loading) {
      fetchMarketData(page + 1, false);
    }
  };

  // Infinite scroll / load-more sentinel removed — pagination now via Prev/Next

  // Pagination is handled via "Load more" / infinite scroll

  return (
    <div className="market-list-page">
      {/* SEARCH BAR */}
      <div className="search-panel">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker or company name..."
          className="market-search-input"
        />
      </div>

      {/* FILTERS ROW */}
      <div className="filters-row">
        <div className="filter-group">
          <label className="filter-label"><Trans>Market</Trans></label>
          <select 
            value={marketFilter} 
            onChange={(e) => setMarketFilter(e.target.value)}
            className="filter-select"
          >
            <option value="All"><Trans>All Markets</Trans></option>
            <option value="US">🇺🇸 US (NYSE/NASDAQ)</option>
            <option value="JP">🇯🇵 Japan (TSE)</option>
            <option value="TH">🇹🇭 Thailand (SET)</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label"><Trans>Sort By</Trans></label>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            <option value="recent_anomalies"><Trans>Recent Anomalies</Trans></option>
            <option value="anomaly_count"><Trans>Anomaly Count</Trans></option>
            <option value="price_low"><Trans>Price: Low to High</Trans></option>
            <option value="price_high"><Trans>Price: High to Low</Trans></option>
            <option value="percent_change_high"><Trans>% Change: High to Low</Trans></option>
            <option value="percent_change_low"><Trans>% Change: Low to High</Trans></option>
            <option value="alphabetical"><Trans>Alphabetical</Trans></option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label"><Trans>Market Status</Trans></label>
          <select 
            value={marketStatus} 
            onChange={(e) => setMarketStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all"><Trans>All</Trans></option>
            <option value="open"><Trans>Open Now</Trans></option>
            <option value="closed"><Trans>Closed</Trans></option>
          </select>
        </div>

        <div className="results-count">
          {`Showing ${visibleData.length} of ${totalCount || sortedData.length} stocks`}
        </div>

        <div className="view-mode-toggle">
          <button 
            className={`view-btn ${viewMode === 'detailed' ? 'active' : ''}`}
            onClick={() => setViewMode('detailed')}
            title="Detailed List"
          >
            ☰ List
          </button>
          <button 
            className={`view-btn ${viewMode === 'boxed' ? 'active' : ''}`}
            onClick={() => setViewMode('boxed')}
            title="Boxed Grid"
          >
            ⊞ Grid
          </button>
        </div>
      </div>

      {/* RESULTS */}
      <div className={`market-results market-results-${viewMode}`}>
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p><Trans>Loading stocks...</Trans></p>
          </div>
        ) : visibleData.length > 0 ? (
          viewMode === 'detailed' ? (
            visibleData.map((item) => {
              const anomalyData = anomaliesMap[item.ticker];
              const priceData = pricesMap[item.ticker];
              const marketOpen = isMarketOpen(item.country);

              return (
                <div 
                  key={item._id || item.ticker} 
                  className="stock-card stock-card-detailed"
                >
                  <div className="stock-card-header">
                    <div className="stock-logo-section">
                      <div className="stock-logo-badge">
                        {item.logo && (
                          <img 
                            src={item.logo} 
                            alt={item.ticker}
                            className="stock-logo"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = '/no-logo.svg';
                            }}
                          />
                        )}
                        <span className="stock-logo-fallback" style={{display: (!item.logo && !item.hideLogo) ? 'block' : 'none'}}>
                          {item.ticker.substring(0, 1)}
                        </span>
                      </div>
                      <div className="stock-info">
                        <div className="stock-ticker-row">
                          <h3 className="stock-ticker">{item.ticker} <span className="stock-exchange">({item.primaryExchange})</span></h3>
                          {marketOpen && <span className="status-badge open"><Trans>● Open</Trans></span>}
                          {!marketOpen && <span className="status-badge closed"><Trans>○ Closed</Trans></span>}
                        </div>
                        <p className="stock-name">{item.companyName}</p>
                      </div>
                    </div>

                    <div className="stock-price-section">
                      {priceData && (
                        <>
                          <div className="stock-price-value">{formatPriceByMarket(priceData.currentPrice, item.country)}</div>
                          <div className={`stock-price-change ${priceData.isUp ? 'up' : 'down'}`}>
                            <span className="change-arrow">{priceData.isUp ? '↑' : '↓'}</span>
                            <span className="change-percent">{Math.abs(priceData.percentChange).toFixed(2)}%</span>
                          </div>
                        </>
                      )}
                    </div>

                    {item.sparklineSvg && (
                      <div className="stock-sparkline" dangerouslySetInnerHTML={{__html: item.sparklineSvg}} />
                    )}

                    <div className="stock-actions">
                      <button className="action-icon" title="View Chart" onClick={(e) => { e.stopPropagation(); navigate(`/chart/u/${item.ticker}`); }}>
                        <ViewChartIcon />
                      </button>
                      <button className="action-icon" title="Compare" onClick={(e) => { e.stopPropagation(); navigate(`/chart?ticker=${item.ticker}`); }}>
                        <CompareIcon />
                      </button>
                      <button className="action-icon" title="Compare Data" onClick={(e) => { e.stopPropagation(); navigate(`/compare?ticker=${item.ticker}`); }}>
                        <CompareDataIcon />
                      </button>
                      <button className="action-icon follow-btn" title="Follow" onClick={(e) => { e.stopPropagation(); toggleFollow(item.ticker); }}>
                        <FollowIcon />
                      </button>
                    </div>


                  </div>

                  {anomalyData && (
                    <div className="anomaly-badge-bar">
                      {anomalyData.count} {anomalyData.count === 1 ? 'anomaly' : 'anomalies'}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            visibleData.map((item) => {
              const anomalyData = anomaliesMap[item.ticker];
              const priceData = pricesMap[item.ticker];

              return (
                <div 
                  key={item._id || item.ticker} 
                  className="stock-card stock-card-boxed"
                >
                  <div className="box-logo-section">
                    <div className="box-logo-badge">
                      {item.logo && (
                        <img 
                          src={item.logo} 
                          alt={item.ticker}
                          className="box-logo"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/no-logo.svg';
                          }}
                        />
                      )}
                      <span className="box-logo-fallback" style={{display: (!item.logo && !item.hideLogo) ? 'block' : 'none'}}>
                        {item.ticker.substring(0, 1)}
                      </span>
                    </div>
                  </div>

                  <div className="box-info-section">
                    <h4 className="box-ticker">{item.ticker} <span className="stock-exchange">({item.primaryExchange})</span></h4>
                    <p className="box-name">{item.companyName}</p>
                  </div>

                  <div className="box-price-section">
                    {priceData && (
                      <>
                        <div className="box-price">{formatPriceByMarket(priceData.currentPrice, item.country)}</div>
                        <div className={`box-change ${priceData.isUp ? 'up' : 'down'}`}>
                          {priceData.isUp ? '↑' : '↓'} {Math.abs(priceData.percentChange).toFixed(2)}%
                        </div>
                      </>
                    )}
                  </div>

                  {item.sparklineSvg && (
                    <div className="box-sparkline" dangerouslySetInnerHTML={{__html: item.sparklineSvg}} />
                  )}

                  <div className="box-actions">
                    <button className="box-follow-btn" onClick={(e) => { e.stopPropagation(); toggleFollow(item.ticker); }}>
                      + Follow
                    </button>
                  </div>

                  {anomalyData && (
                    <div className="box-anomaly-badge">
                      {anomalyData.count}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No stocks found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        )}
      </div>
      {/* Sentinel for infinite scroll + load more fallback */}
      <div className="marketlist-load-more">
        {!isSearching && (
          <div className="pagination-controls">
            <button className="pagination-btn prev-btn" onClick={goPrev} disabled={page <= 1 || loading}>&laquo; Prev</button>
            {/* Load more removed — use Prev/Next for pagination */}
            <button className="pagination-btn next-btn" onClick={goNext} disabled={page >= totalPages || loading}>Next &raquo;</button>
            {/* sentinel removed */}
          </div>
        )}
      </div>
    </div>
  );
}
