import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { useAuth } from "../context/useAuth";
import { ViewChartIcon, CompareIcon, CompareDataIcon, FollowIcon, MenuIcon, FavoriteIcon } from "../components/SvgIcons";
import "../css/MarketList.css";

echarts.use([LineChart, GridComponent, SVGRenderer]);

const API_URL = "http://localhost:5050/node";
const PY_API_URL = "http://localhost:5000/py";
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
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef(null);
  const navigate = useNavigate();

  // ---------------------------------------------------
  // Initial data fetch
  // ---------------------------------------------------
  useEffect(() => {
    fetchMarketData();
    fetchRecentAnomalies();
    if (user) {
      fetchUserFavorites();
    }
  }, [user]);

  // ---------------------------------------------------
  // Debounced search
  // ---------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMarketData();
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

const generateSparklineSVG = (closes) => {
  if (!closes || closes.length < 2) return "";

  try {
    const chart = echarts.init(null, null, {
      renderer: "svg",
      ssr: true,
      width: 120,
      height: 36,
    });

    chart.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: closes.map((_, idx) => idx),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: "line",
          data: closes,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, color: "#2cc17f" },
          areaStyle: { opacity: 0 },
          emphasis: { disabled: true },
        },
      ],
      tooltip: { show: false },
    });

    const svg = chart.renderToSVGString();
    chart.dispose();
    return svg;
  } catch (err) {
    console.error("Sparkline render error:", err);
    return "";
  }
};

const resolveYfTicker = (ticker, country) => {
  const hasSuffix = ticker.includes('.');
  if (hasSuffix) return ticker;
  if (country === 'TH') return `${ticker}.BK`;
  if (country === 'JP') return `${ticker}.T`;
  return ticker;
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
    const res = await fetch(`${API_URL}/cache?ticker=${encodeURIComponent(yfTicker)}&period=1mo&interval=1d`);
    if (!res.ok) return "";
    const data = await res.json();
    
    if (data.data && data.data.close && Array.isArray(data.data.close)) {
      return generateSparklineSVG(data.data.close);
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
    const res = await fetch(`${API_URL}/price/bulk`, {
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

const fetchMarketData = async () => {
  setLoading(true);

  try {
    // Fetch all marketlist data (no limit) - can be up to 5000+ tickers
    const res = await fetch(`${API_URL}/marketlists`);
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
        const skipLogoTickers = ['BJC.BK', 'OSP.BK', 'RJH.BK', '9522.T',
          // JP tickers without logos
          '1811.T', '1788.T', '1783.T', '1793.T', '1810.T', '1799.T', '1762.T', '1798.T', '1814.T', '182A.T', '181A.T', '1821.T',
          '1773.T', '1826.T', '1764.T', '1786.T', '176A.T', '1848.T', '1776.T', '1807.T', '177A.T', '1822.T', '179A.T', '1840.T',
          '175A.T', '183A.T', '1820.T', '1828.T', '1827.T', '1835.T', '1844.T', '1795.T', '1847.T', '1841.T', '180A.T'
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
          logo: (!shouldSkipLogo && logoTicker) ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(logoTicker)}?format=png` : "",
          sparklineSvg: "",
        };
      });

    // Try to fetch all pre-cached sparklines from bulk endpoint (skip if previously unsupported)
    let sparklineMap = {};
    if (!bulkSparklineUnsupported) {
      try {
        const sparklineRes = await fetch(`${API_URL}/cache/sparklines/all`);
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
              if (item.ticker && item.close) {
                sparklineMap[item.ticker] = generateSvg(item.close);
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
    
    // Fetch prices in batches with concurrency control (max 3 batch fetches in parallel)
    const BATCH_SIZE = 30;
    let allPriceData = {};
    const priceBatches = [];
    
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      priceBatches.push(() => fetchBulkPriceData(batch));
    }
    
    const priceResults = await executeWithConcurrency(priceBatches, 3);
    priceResults.forEach(r => {
      if (r.status === 'ok' && typeof r.data === 'object') {
        allPriceData = { ...allPriceData, ...r.data };
      }
    });
    
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
      ? `${API_URL}/anomalies/summary?market=${market}`
      : `${API_URL}/anomalies/summary`;
    
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
    const res = await fetch(`${API_URL}/favorites`, {
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
      const res = await fetch(`${API_URL}/favorites/${encodeURIComponent(ticker)}`, {
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
      const res = await fetch(`${API_URL}/favorites`, {
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

  // Sorting
  const sortedData = [...filteredData].sort((a, b) => {
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

  // Visible slice for infinite scroll
  const visibleData = sortedData.slice(0, visibleCount);

  // Lazy-load sparklines for currently visible items (and a small buffer)
  useEffect(() => {
    const loadVisibleSparklines = async () => {
      if (visibleData.length === 0) return;

      // Buffer ahead to reduce pop-in during scroll
      const BUFFER = 50;
      const target = sortedData.slice(0, Math.min(visibleCount + BUFFER, sortedData.length));

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
  }, [visibleCount, sortedData]);

  const loadMore = () => {
    if (visibleCount < sortedData.length) {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, sortedData.length));
    }
  };

  // IntersectionObserver to auto-load more when scrolled near bottom
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) loadMore();
      });
    }, { root: null, rootMargin: '400px', threshold: 0 });

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loadMoreRef.current, sortedData.length, visibleCount]);

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
          <label className="filter-label">Market</label>
          <select 
            value={marketFilter} 
            onChange={(e) => setMarketFilter(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Markets</option>
            <option value="US">🇺🇸 US (NYSE/NASDAQ)</option>
            <option value="JP">🇯🇵 Japan (TSE)</option>
            <option value="TH">🇹🇭 Thailand (SET)</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Sort By</label>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            <option value="recent_anomalies">Recent Anomalies</option>
            <option value="anomaly_count">Anomaly Count</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="percent_change_high">% Change: High to Low</option>
            <option value="percent_change_low">% Change: Low to High</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Market Status</label>
          <select 
            value={marketStatus} 
            onChange={(e) => setMarketStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All</option>
            <option value="open">Open Now</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="results-count">
          {sortedData.length} stocks
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
            <p>Loading stocks...</p>
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
                              e.target.style.display = 'none';
                              e.target.nextElementSibling.style.display = 'block';
                            }}
                          />
                        )}
                        <span className="stock-logo-fallback" style={{display: item.logo ? 'none' : 'block'}}>
                          {item.ticker.substring(0, 1)}
                        </span>
                      </div>
                      <div className="stock-info">
                        <div className="stock-ticker-row">
                          <h3 className="stock-ticker">{item.ticker} <span className="stock-exchange">({item.primaryExchange})</span></h3>
                          {marketOpen && <span className="status-badge open">● Open</span>}
                          {!marketOpen && <span className="status-badge closed">○ Closed</span>}
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
                      <button className="action-icon" title="Compare" onClick={(e) => e.stopPropagation()}>
                        <CompareIcon />
                      </button>
                      <button className="action-icon" title="Compare Data" onClick={(e) => e.stopPropagation()}>
                        <CompareDataIcon />
                      </button>
                      <button className="action-icon follow-btn" title="Follow" onClick={(e) => e.stopPropagation()}>
                        <FollowIcon />
                      </button>
                      <button 
                        className="action-icon" 
                        title={favoritesSet.has(item.ticker.toUpperCase()) ? "Remove favorite" : "Add favorite"}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(item.ticker); }}
                      >
                        <FavoriteIcon filled={favoritesSet.has(item.ticker.toUpperCase())} />
                      </button>
                      <button className="action-icon menu-btn" title="Menu" onClick={(e) => e.stopPropagation()}>
                        <MenuIcon />
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
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'block';
                          }}
                        />
                      )}
                      <span className="box-logo-fallback" style={{display: item.logo ? 'none' : 'block'}}>
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
                    <button className="box-follow-btn" onClick={(e) => { e.stopPropagation(); }}>
                      + Follow
                    </button>
                    <button 
                      className="box-favorite-btn" 
                      title={favoritesSet.has(item.ticker.toUpperCase()) ? "Remove favorite" : "Add favorite"}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(item.ticker); }}
                    >
                      <FavoriteIcon filled={favoritesSet.has(item.ticker.toUpperCase())} />
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
        {visibleCount < sortedData.length && (
          <>
            <button className="load-more-btn" onClick={loadMore}>Load more</button>
            <div ref={loadMoreRef} style={{height: 1}} aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}
