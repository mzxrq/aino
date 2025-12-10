import React, { useState, useEffect } from "react";
import MarketItemCard from "../components/MarketItemCard.jsx";
import CategoryDropdown from "../components/CategoryDropdown";

export default function MarketListScreen() {
  const [search, setSearch] = useState("");
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

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Market List</h1>

      {/* SEARCH */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search ticker or company..."
        style={styles.searchBar}
      />

      {/* DROPDOWNS */}
      <div style={styles.dropdownRow}>
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
      </div>

      {/* RESULTS */}
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <p style={{ color: "#fff" }}>Loading...</p>
        ) : filteredData.length > 0 ? (
          filteredData.map((item) => (
            <MarketItemCard key={item._id || item.ticker} item={item} />
          ))
        ) : (
          <p style={{ color: "#fff" }}>No results found</p>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#050B16",
    padding: 20,
    paddingTop: 60,
    boxSizing: "border-box",
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 20,
  },
  searchBar: {
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 15,
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid rgba(0,255,200,0.12)",
    color: "#fff",
    width: "100%",
  },
  dropdownRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 8,
  },
};
