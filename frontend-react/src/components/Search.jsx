import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "../css/Search.css";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
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
        <ul className="search-dropdown">
          {results.map((item) => (
            <li key={item.ticker} className="search-item">
              <Link
                to={`/chart?ticker=${item.ticker}`}
                className="search-link"
                onClick={() => setShowDropdown(false)}
              >
                <span className="ticker">{item.ticker}</span> - <span className="name">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
