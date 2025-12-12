import React, { useState, useEffect } from "react";
import MarketItemCard from "../components/MarketItemCard.jsx";
import CategoryDropdown from "../components/CategoryDropdown";
import "../css/MarketList.css";

export default function MarketListScreen() {
  const [search, setSearch] = useState("");
  const [assetType, setAssetType] = useState("stocks");
  const [category, setCategory] = useState("All");
  const [industry, setIndustry] = useState("All");
  const [country, setCountry] = useState("All");

  const [marketData, setMarketData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Dropdown lists
  const [categories, setCategories] = useState(["All"]);
  const [industries, setIndustries] = useState(["All"]);
  const [countries, setCountries] = useState(["All"]);

  // ---------------------------------------------------
  // Fetch data with search filter (auto-fetch + debounce)
  // ---------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMarketData();
    }, 300); // debounce 300ms

    return () => clearTimeout(timer);
  }, [search]);

const fetchMarketData = async () => {
  setLoading(true);

  try {
    const url =
      search.trim() === ""
        ? "http://localhost:5050/node/marketlists" 
        : `http://localhost:5000/chart/ticker?query=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const json = await res.json();
    const rawList = Array.isArray(json) ? json : json.data || [];

    // Normalize list
    const list = rawList.map((it) => {
  const ticker = it.ticker || it.Ticker || "";

  return {
    _id: it._id,
    ticker,
    name: it.name || it["Company Name"] || "",
    primaryExchange: it.primaryExchange || it["Primary Exchange"] || "",
    industry:
      it.sector ||
      it.Sector ||
      it["Sector Group"] ||
      it["SectorGroup"] ||
      "",
    country: it.country || it.Country || "",

    // Auto-generate ticker logo URL
    logo: ticker
      ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(
          ticker
        )}?format=png`
      : "",

    raw: it,
  };
});


    setMarketData(list);

    // Populate dropdowns once
    if (categories.length === 1) {
      const exSet = [...new Set(list.map((i) => i.primaryExchange).filter(Boolean))];
      setCategories(["All", ...exSet.sort()]);
    }

    if (industries.length === 1) {
      const indSet = [...new Set(list.map((i) => i.industry).filter(Boolean))];
      setIndustries(["All", ...indSet.sort()]);
    }

    if (countries.length === 1) {
      const countrySet = [...new Set(list.map((i) => i.country).filter(Boolean))];
      setCountries(["All", ...countrySet.sort()]);
    }
  } catch (err) {
    console.error("Error fetching market list:", err);
  }

  setLoading(false);
};


  // ---------------------------------------------------
  // Local filtering (after backend search)
  // ---------------------------------------------------
  const filteredData = marketData.filter((item) => {
    const matchCategory =
      category === "All" ||
      item.primaryExchange === category ||
      item.industry === category;

    const matchIndustry = industry === "All" || item.industry === industry;

    const matchCountry = country === "All" || item.country === country;

    return matchCategory && matchIndustry && matchCountry;
  });

  // Sort: Subscriptions at top (if item has _id from /node/subscribers/me), then alphabetically by ticker
  const sortedData = [...filteredData].sort((a, b) => {
    const aIsSubscription = !!a._id;
    const bIsSubscription = !!b._id;
    
    if (aIsSubscription && !bIsSubscription) return -1;
    if (!aIsSubscription && bIsSubscription) return 1;
    
    // Both same priority, sort alphabetically
    return (a.ticker || '').localeCompare(b.ticker || '');
  });

  const assetTypes = [
    { id: 'stocks', label: 'Stocks', icon: '📈' },
    { id: 'funds', label: 'Funds', icon: '💼' },
    { id: 'futures', label: 'Futures', icon: '📊' },
    { id: 'forex', label: 'Forex', icon: '💱' },
    { id: 'crypto', label: 'Crypto', icon: '₿' },
    { id: 'indices', label: 'Indices', icon: '📉' },
    { id: 'bonds', label: 'Bonds', icon: '📜' },
    { id: 'economy', label: 'Economy', icon: '🏛' },
    { id: 'options', label: 'Options', icon: '⚡' },
  ];

  return (
    <div className="market-list-page">
      <div className="market-list-header">
        <div>
          <p className="eyebrow">Explore markets</p>
          <h1>Market Search</h1>
          <p className="subtitle">Filter by asset class, exchange, industry, and country</p>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="search-panel">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker or company..."
          className="market-search-input"
        />
      </div>

      {/* ASSET TYPE PILLS */}
      <div className="asset-type-pills">
        {assetTypes.map(type => (
          <button
            key={type.id}
            className={`asset-pill ${assetType === type.id ? 'active' : ''}`}
            onClick={() => setAssetType(type.id)}
          >
            <span className="pill-icon">{type.icon}</span>
            <span>{type.label}</span>
          </button>
        ))}
      </div>

      {/* FILTERS ROW */}
      <div className="filters-row">
        <CategoryDropdown
          value={category}
          onChange={setCategory}
          items={categories}
          label="Exchange"
        />
        <CategoryDropdown
          value={industry}
          onChange={setIndustry}
          items={industries}
          label="Industry"
        />
        <CategoryDropdown
          value={country}
          onChange={setCountry}
          items={countries}
          label="Country"
        />
        <div className="results-count">
          {filteredData.length} results
        </div>
      </div>

      {/* RESULTS */}
      <div className="market-results">
        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : sortedData.length > 0 ? (
          sortedData.map((item) => (
            <MarketItemCard key={item._id || item.ticker} item={item} />
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No results found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
