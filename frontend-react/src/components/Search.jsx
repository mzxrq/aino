import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../css/Search.css";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const API_URL = "http://localhost:5000";

  // Debounced AJAX search
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!query) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/chart/ticker?query=${encodeURIComponent(query)}`);
        const data = await res.json();

        setResults(data);
        setShowDropdown(data.length > 0);
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
        placeholder="Search ticker..."
        className="search-input"
        onFocus={() => query && results.length && setShowDropdown(true)}
      />
      {showDropdown && (
        <div className="search-dropdown">
          <ul className="search-results-list">
            {results.slice(0, 5).map((item) => (
              <li key={item.ticker} className="search-item">
                <button
                  className="search-link"
                  onClick={() => handleResultClick(item.ticker)}
                >
                  <span className="ticker">{item.ticker}</span>
                  <span className="name">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {results.length > 0 && (
            <button className="search-show-more" onClick={handleShowMore}>
              Show More →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
