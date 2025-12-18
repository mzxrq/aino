// MarketItemCard.jsx
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import "../css/MarketItemCard.css";

// Utility function to get company name from various possible fields
const getCompanyName = (item) => {
  return (
    item.companyName ||
    item.companyname ||
    item.company ||
    item.name ||
    item.Name ||
    item["Company Name"] ||
    item.company_name ||
    item.raw?.companyName ||
    item.raw?.company ||
    item.raw?.name ||
    "Unknown Company"
  );
};

// Generate sparkline SVG from price data array
const Sparkline = ({ data = [], width = 100, height = 40 }) => {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const isPositive = data[data.length - 1] >= data[0];
  const color = isPositive ? '#2cc17f' : '#e05654';

  return (
    <svg width={width} height={height} className="sparkline-svg">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default function MarketItemCard({ item }) {
  const [logoError, setLogoError] = useState(false);
  const [sparklineData, setSparklineData] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // --- 1. Normalized Fields ---
  const ticker = item.ticker || item.Ticker || "";
  const company = metadata?.companyName || getCompanyName(item);
  const primaryExchange = item.primaryExchange || item["Primary Exchange"] || "";
  const sectorGroup = item.sectorGroup || item["Sector Group"] || "";

  // --- 2. Fetch metadata and sparkline data ---
  useEffect(() => {
    let mounted = true;

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
    const PY_BASE = `${API_URL}/py`;
    async function fetchPyJson(path, init) {
      try {
        const res = await fetch(`${PY_BASE}${path}`, init);
        if (res.ok) return await res.json();
      } catch (_) { /* ignore */ }
      const res2 = await fetch(`${PY_DIRECT}/py${path}`, init);
      if (!res2.ok) throw new Error(`status ${res2.status}`);
      return await res2.json();
    }

    const fetchData = async () => {
      if (!ticker) {
        setLoading(false);
        return;
      }

      try {
        const chartDataRaw = await fetchPyJson(`/chart?ticker=${encodeURIComponent(ticker)}&period=1mo&interval=1d`);
        // Resolve possible multi-ticker format
        const chartData = (chartDataRaw && typeof chartDataRaw === 'object') ? (chartDataRaw[ticker] || chartDataRaw[ticker?.toUpperCase?.()] || chartDataRaw) : chartDataRaw;

        if (mounted) {
          // Extract company name from chart response
          const companyName = chartData.companyName || chartData.Ticker || ticker;
          setMetadata({ companyName });
          
          // Extract close prices for sparkline (last 30 days)
          const closes = chartData.close || [];
          setSparklineData(closes.slice(-30));
          setLoading(false);
        }
      } catch (err) {
        console.error(`Failed to fetch data for ${ticker}:`, err);
        if (mounted) {
          setSparklineData([]);
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [ticker]);

  // --- 3. Calculate price and change ---
  const currentPrice = sparklineData.length > 0 ? sparklineData[sparklineData.length - 1] : null;
  const oldPrice = sparklineData.length > 0 ? sparklineData[0] : null;
  const priceChange = currentPrice && oldPrice ? ((currentPrice - oldPrice) / oldPrice) * 100 : 0;
  const isUp = priceChange >= 0;

  const priceStr = currentPrice != null
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(currentPrice)
    : "-";

  const changeStr = `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%`;

  // --- 4. Logo Handling (Parqet primary, Clearbit fallback) ---
  const logoUrl = item.logo || `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png`;
  const fallbackLogoUrl = `https://logo.clearbit.com/${ticker.replace(/[^A-Za-z]/g, '').toLowerCase()}.com`;
  const showLogo = !logoError;

  // --- 5. Click Handler ---
  const handleClick = () => {
    navigate('/chart', { state: { ticker } });
  };

  // --- 6. Render ---
  return (
    <div className="market-item-card" onClick={handleClick}>
      {/* LEFT: Logo + Ticker + Company */}
      <div className="card-left">
        {showLogo ? (
          <img
            src={logoUrl}
            alt={ticker}
            className="card-logo"
            onError={(e) => {
              // Try fallback URL once
              if (e.target.src !== fallbackLogoUrl) {
                e.target.src = fallbackLogoUrl;
              } else {
                setLogoError(true);
              }
            }}
          />
        ) : (
          <div className="card-logo-placeholder" />
        )}

        <div className="card-info">
          <div className="card-ticker">{ticker}</div>
          <div className="card-company">{company}</div>
          <div className="card-meta">
            {primaryExchange}
            {sectorGroup && ` • ${sectorGroup}`}
          </div>
        </div>
      </div>

      {/* MIDDLE: Sparkline Chart */}
      <div className="card-chart">
        {loading ? (
          <div className="sparkline-loading" />
        ) : sparklineData.length > 0 ? (
          <Sparkline data={sparklineData} width={120} height={50} />
        ) : (
          <div className="sparkline-empty">No data</div>
        )}
      </div>

      {/* RIGHT: Price + Change */}
      <div className="card-right">
        <div className="card-price">{priceStr}</div>
        <div className={`card-change ${isUp ? 'up' : 'down'}`}>
          {changeStr}
        </div>
      </div>
    </div>
  );
}

// --- Prop Types ---
MarketItemCard.propTypes = {
  item: PropTypes.shape({
    ticker: PropTypes.string.isRequired,
    name: PropTypes.string,
    companyName: PropTypes.string,
    primaryExchange: PropTypes.string,
    sectorGroup: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    change: PropTypes.number,
    anomaly: PropTypes.number,
    raw: PropTypes.object,
    logo: PropTypes.string,
  }).isRequired,
};
