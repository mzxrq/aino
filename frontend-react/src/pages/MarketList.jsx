import React, { useState, useEffect } from "react";
import MarketItemCard from "../components/MarketItemCard.jsx";
import CategoryDropdown from "../components/CategoryDropdown";

export default function MarketListScreen() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [industry, setIndustry] = useState("All");
  const [country, setCountry] = useState("All");
  const [marketData, setMarketData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Default categories; backend `types` are "Primary Exchange" values
  const [categories, setCategories] = useState(["All"]);
  const [industries, setIndustries] = useState(["All"]);
  const [countries, setCountries] = useState(["All"]);

  // --- Fetch market data from backend ---
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch("http://localhost:5050/market");
        const json = await response.json();

        // Backend may return { data, types } or a plain array
        const rawList = Array.isArray(json) ? json : (json.data || []);

        // Normalize items to a stable shape the UI expects
        const list = rawList.map((it) => ({
          _id: it._id,
          ticker: it.Ticker || it.ticker || "",
          name: it["Company Name"] || it.name || it.company || "",
          primaryExchange: it["Primary Exchange"] || it.primaryExchange || it["PrimaryExchange"] || "",
          sectorGroup: it["Sector Group"] || it["SectorGroup"] || it.Sector || it.sector || "",
          raw: it,
        }));

        setMarketData(list);

        // If backend provides types (Primary Exchange), use them as categories for the dropdown
        if (json && json.types && Array.isArray(json.types) && json.types.length > 0) {
          setCategories(["All", ...json.types]);
        } else {
          // derive exchanges from raw data if types not provided
          const exSet = new Set(rawList.map((it) => (it["Primary Exchange"] || it.primaryExchange || '').toString()).filter(Boolean));
          setCategories(["All", ...Array.from(exSet).sort()]);
        }

        // derive industries (Sector Group) and countries from raw data
        const indSet = new Set(rawList.map((it) => (it["Sector Group"] || it.Sector || it.sector || it["SectorGroup"] || '').toString()).filter(Boolean));
        setIndustries(["All", ...Array.from(indSet).sort()]);

        const countrySet = new Set(rawList.map((it) => (it.Country || it.country || '').toString()).filter(Boolean));
        setCountries(["All", ...Array.from(countrySet).sort()]);

        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch market data:", err);
        setLoading(false);
      }
    };

    fetchMarketData();
  }, []);

  // --- Filter by search and category ---
  const filteredData = marketData.filter((item) => {
    // Use normalized fields produced earlier in this file
    const ticker = (item.ticker || "").toString();
    const name = (item.name || "").toString();
    const primaryExchange = (item.primaryExchange || "").toString();
    const sectorGroup = (item.sectorGroup || "").toString();
    const itemCountry = (item.raw?.Country || item.raw?.country || "").toString();
    const categoryValue = category || "All";
    const industryValue = industry || "All";
    const countryValue = country || "All";

    const q = search.trim().toLowerCase();
    const matchesSearch = !q || ticker.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    // Dropdown `category` is populated from backend `types` (Primary Exchange) when available.
    // If categories are sectors instead, this logic also falls back to matching sectorGroup.
    const matchesCategory =
      categoryValue === "All" ||
      primaryExchange.toLowerCase() === String(categoryValue).toLowerCase() ||
      sectorGroup.toLowerCase() === String(categoryValue).toLowerCase();

    const matchesIndustry =
      industryValue === "All" ||
      sectorGroup.toLowerCase() === String(industryValue).toLowerCase();

    const matchesCountry =
      countryValue === "All" ||
      itemCountry.toLowerCase() === String(countryValue).toLowerCase();

    return matchesSearch && matchesCategory && matchesIndustry && matchesCountry;
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

      {/* DROPDOWNS: Exchange, Industry, Country */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
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

      {/* LIST */}
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <p style={{ color: "#fff" }}>Loading...</p>
        ) : filteredData.length > 0 ? (
          filteredData.map((item, index) => (
            <MarketItemCard key={item.ticker || item._id || index} item={item} />
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
    boxSizing: "border-box",
  },
};
