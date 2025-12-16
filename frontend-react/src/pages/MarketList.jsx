import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import "../css/MarketList.css";

echarts.use([LineChart, GridComponent, SVGRenderer]);

const API_URL = "http://localhost:5050/node";
const PY_API_URL = "http://localhost:5000/py";

export default function MarketListScreen() {
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("All");
  const [sortBy, setSortBy] = useState("recent_anomalies");
  const [marketStatus, setMarketStatus] = useState("all");

  const [marketData, setMarketData] = useState([]);
  const [anomaliesMap, setAnomaliesMap] = useState({});
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
  }, []);

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

const fetchChartDataForSparkline = async (ticker) => {
  try {
    const res = await fetch(`${API_URL}/cache?ticker=${ticker}&period=1mo&interval=1d`);
    const data = await res.json();
    
    if (data.data && data.data.close && Array.isArray(data.data.close)) {
      return generateSparklineSVG(data.data.close);
    }
  } catch (err) {
    console.error(`Error fetching sparkline for ${ticker}:`, err);
  }
  return "";
};

const fetchMarketData = async () => {
  setLoading(true);

  try {
    // Always fetch all data, then filter client-side for live search
    const res = await fetch(`${API_URL}/marketlists?limit=1000`);
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
        
        // Add .BK suffix for Thai stocks for logo API
        const logoTicker = country === "TH" && !ticker.includes(".BK") ? `${ticker}.BK` : ticker;
        
        return {
          _id: it._id,
          ticker: ticker,
          companyName: companyName,
          primaryExchange: it.primaryExchange || it["Primary Exchange"] || "",
          sectorGroup: it.sectorGroup || it.sector || "",
          country: country,
          logo: logoTicker ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(logoTicker)}?format=png` : "",
          sparklineSvg: "",
        };
      });

    // Fetch sparklines for each ticker in parallel
    const sparklinePromises = list.map(item =>
      fetchChartDataForSparkline(item.ticker).then(svg => ({
        ticker: item.ticker,
        svg
      }))
    );
    
    const sparklines = await Promise.all(sparklinePromises);
    const sparklineMap = Object.fromEntries(sparklines.map(s => [s.ticker, s.svg]));
    
    list = list.map(item => ({
      ...item,
      sparklineSvg: sparklineMap[item.ticker] || ""
    }));

    setMarketData(list);
  } catch (err) {
    console.error("Error fetching market list:", err);
  }

  setLoading(false);
};

const fetchRecentAnomalies = async () => {
  try {
    const res = await fetch(`${API_URL}/anomalies/recent`);
    const data = await res.json();
    
    // Create a map of ticker -> anomaly data
    const anomaliesData = {};
    if (Array.isArray(data)) {
      data.forEach(anomaly => {
        const ticker = anomaly.ticker;
        if (!anomaliesData[ticker]) {
          anomaliesData[ticker] = {
            count: 0,
            lastDetected: null,
            latestPrice: anomaly.price || null
          };
        }
        anomaliesData[ticker].count += 1;
        
        const detectedAt = new Date(anomaly.detected_at || anomaly.date);
        if (!anomaliesData[ticker].lastDetected || detectedAt > anomaliesData[ticker].lastDetected) {
          anomaliesData[ticker].lastDetected = detectedAt;
        }
      });
    }
    
    setAnomaliesMap(anomaliesData);
  } catch (err) {
    console.error("Error fetching recent anomalies:", err);
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

    if (sortBy === "recent_anomalies") {
      // Sort by most recent anomaly detection
      if (!aAnomalies.lastDetected && !bAnomalies.lastDetected) return 0;
      if (!aAnomalies.lastDetected) return 1;
      if (!bAnomalies.lastDetected) return -1;
      return bAnomalies.lastDetected - aAnomalies.lastDetected;
    }

    if (sortBy === "price_low") {
      // Sort by price low to high
      const aPrice = aAnomalies.latestPrice || 0;
      const bPrice = bAnomalies.latestPrice || 0;
      if (aPrice === 0 && bPrice === 0) return 0;
      if (aPrice === 0) return 1;
      if (bPrice === 0) return -1;
      return aPrice - bPrice;
    }

    if (sortBy === "price_high") {
      // Sort by price high to low
      const aPrice = aAnomalies.latestPrice || 0;
      const bPrice = bAnomalies.latestPrice || 0;
      return bPrice - aPrice;
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
      </div>

      {/* RESULTS */}
      <div className="market-results">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading stocks...</p>
          </div>
        ) : visibleData.length > 0 ? (
          visibleData.map((item) => {
            const anomalyData = anomaliesMap[item.ticker];
            const marketOpen = isMarketOpen(item.country);

            return (
              <div 
                key={item._id || item.ticker} 
                className="stock-card"
                onClick={() => navigate(`/chart/u/${item.ticker}`)}
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
                      <h3 className="stock-ticker">{item.ticker}</h3>
                      <p className="stock-name">{item.companyName}</p>
                    </div>
                  </div>
                  {marketOpen && <span className="status-badge open">● Open</span>}
                  {!marketOpen && <span className="status-badge closed">○ Closed</span>}
                </div>

                <div className="stock-card-body">
                  {item.sparklineSvg && (
                    <div className="stock-chart-spark" dangerouslySetInnerHTML={{__html: item.sparklineSvg}} />
                  )}

                  <div className="stock-meta">
                    <span className="meta-item">
                      <span className="meta-label">Market:</span>
                      <span className="meta-value">{item.country} - {item.primaryExchange}</span>
                    </span>
                    {item.sectorGroup && (
                      <span className="meta-item">
                        <span className="meta-label">Sector:</span>
                        <span className="meta-value">{item.sectorGroup}</span>
                      </span>
                    )}
                  </div>

                  {anomalyData && (
                    <div className="anomaly-info">
                      <span className="anomaly-badge">
                        🚨 {anomalyData.count} {anomalyData.count === 1 ? 'anomaly' : 'anomalies'}
                      </span>
                      {anomalyData.lastDetected && (
                        <span className="anomaly-time">
                          Last: {new Date(anomalyData.lastDetected).toLocaleDateString()}
                        </span>
                      )}
                      {anomalyData.latestPrice && (
                        <span className="anomaly-price">
                          ${anomalyData.latestPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })
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
