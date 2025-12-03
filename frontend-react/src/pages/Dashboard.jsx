import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css';

export default function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const NODE_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTicker, setSearchTicker] = useState('');

  // Fetch subscriptions on mount
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchSubscriptions = async () => {
      setIsLoading(true);
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(`${NODE_API_URL}/dashboard/${user.userId}`, { headers });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        // Normalize data: handle array of strings or array of objects
        const tickersArray = Array.isArray(data) ? data : data.tickers || [];
        const normalizedSubs = tickersArray.map(t =>
          typeof t === "string"
            ? { ticker: t, frequency: "N/A", status: "Unknown" }
            : {
                ticker: t.ticker || t.symbol || "UNKNOWN",
                frequency: t.frequency ?? "N/A",
                status: t.status ?? "Unknown",
              }
        );

        setSubscriptions(normalizedSubs);
      } catch (err) {
        console.error("Failed to fetch subscriptions:", err);
        setSubscriptions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscriptions();
  }, [user, token, navigate]);

  // Handle unsubscribe
  const handleUnsubscribe = async (ticker) => {
    if (!window.confirm(`Unsubscribe from ${ticker}?`)) return;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${NODE_API_URL}/subscriptions/`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ lineId: user.userId, tickers: [ticker] }),
      });

      if (!response.ok) throw new Error('Failed to unsubscribe');

      // Remove ticker from state
      setSubscriptions(subs => subs.filter(s => s.ticker !== ticker));
    } catch (err) {
      console.error("Unsubscribe error:", err);
      alert("Failed to unsubscribe. Please try again.");
    }
  };

  const handleSearch = () => {
    if (searchTicker.trim()) {
      navigate("/chart", { state: { ticker: searchTicker.toUpperCase() } });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (isLoading || !user) {
    return (
      <div className="dashboard-container">
        <div className="loading-skeleton">
          <div className="skeleton-title"></div>
          <div className="skeleton-text"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>My Dashboard</h1>
          <p>Welcome, <span className="user-name">{user.displayName}</span>! Track your stock subscriptions</p>
        </div>
      </div>

      {/* Search Section */}
      <div className="search-section">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Search for a new ticker (e.g., AAPL, GOOGL, TSLA)" 
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value)}
            onKeyPress={handleKeyPress}
            className="search-input"
          />
          <button onClick={handleSearch} className="btn btn-search">
            <span>🔍</span>
            <span>Search</span>
          </button>
        </div>
      </div>

      {/* Subscriptions Section */}
      <div className="subscriptions-section">
        <div className="section-header">
          <h2>My Subscriptions</h2>
          <span className="badge badge-count">{subscriptions.length}</span>
        </div>

        {subscriptions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>No Subscriptions Yet</h3>
            <p>You haven't subscribed to any stocks yet. Use the search box above to find and subscribe to your favorite stocks!</p>
            <Link to="/chart" className="btn btn-primary">Explore Stocks</Link>
          </div>
        ) : (
          <div className="subscriptions-grid">
            {subscriptions.map(sub => (
              <div key={sub.ticker} className="subscription-card">
                <div className="card-header">
                  <div className="ticker-info">
                    <h3 className="ticker">{sub.ticker}</h3>
                    <span className={`status-badge status-${sub.status.toLowerCase()}`}>
                      {sub.status}
                    </span>
                  </div>
                  <button 
                    className="btn-close"
                    onClick={() => handleUnsubscribe(sub.ticker)}
                    title="Unsubscribe"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="card-body">
                  <div className="info-row">
                    <span className="label">Frequency</span>
                    <span className="value">{sub.frequency}</span>
                  </div>
                </div>

                <div className="card-footer">
                  <button
                    className="btn btn-view"
                    onClick={() => navigate("/chart", { state: { ticker: sub.ticker } })}
                  >
                    View Chart
                  </button>
                  <button
                    className="btn btn-unsubscribe"
                    onClick={() => handleUnsubscribe(sub.ticker)}
                  >
                    Unsubscribe
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
