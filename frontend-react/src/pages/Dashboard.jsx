import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import '../css/Dashboard.css';

const NODE_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

export default function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTicker, setSearchTicker] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
        const response = await fetch(`${NODE_API_URL}/node/subscribers/me`, { headers });

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

  const resolveStatusKey = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('anomaly')) return 'anomaly';
    if (s.includes('safe') || s.includes('active')) return 'safe';
    return 'unknown';
  };

  const normalizedStats = useMemo(() => {
    const total = subscriptions.length;
    const anomaly = subscriptions.filter(s => resolveStatusKey(s.status) === 'anomaly').length;
    const stable = subscriptions.filter(s => resolveStatusKey(s.status) === 'safe').length;
    const unknown = total - anomaly - stable;
    return { total, anomaly, stable, unknown };
  }, [subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    if (statusFilter === 'all') return subscriptions;
    return subscriptions.filter(sub => resolveStatusKey(sub.status) === statusFilter);
  }, [subscriptions, statusFilter]);

  // Handle unsubscribe
  const handleUnsubscribe = async (ticker) => {
    if (!window.confirm(`Unsubscribe from ${ticker}?`)) return;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Ensure we send normalized id (frontend normalizes to `user.id`)
      // Keep fallback to legacy `user.userId` for safety
      const response = await fetch(`${NODE_API_URL}/node/subscribers`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: user.id || user.userId, tickers: [ticker] }),
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

  const statusClass = (status) => {
    const key = resolveStatusKey(status);
    if (key === 'anomaly') return 'status-pill danger';
    if (key === 'safe') return 'status-pill success';
    return 'status-pill muted';
  };

  if (isLoading || !user) {
    return (
      <div className="dashboard-shell">
        <div className="panel loading-panel">
          <div className="skeleton skeleton-lg" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <section className="hero-card">
        <div className="hero-text">
          <p className="eyebrow">Portfolio pulse</p>
          <h1>Welcome back, <span className="accent">{user.name}</span></h1>
          <p className="lede">Track subscriptions, jump into charts, and act on anomalies faster.</p>
          <div className="hero-actions">
            <div className="search-wrap">
              <input
                type="text"
                placeholder="Jump to a ticker (AAPL, NVDA, TSLA)"
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value)}
                onKeyPress={handleKeyPress}
                className="search-input"
              />
              <button onClick={handleSearch} className="btn btn-primary">Chart</button>
            </div>
            <button className="btn ghost" onClick={() => navigate('/chart')}>Markets</button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <p className="stat-label">Tracked tickers</p>
            <h3>{normalizedStats.total}</h3>
            <span className="chip muted">live watchlist</span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Anomaly flags</p>
            <h3 className="text-danger">{normalizedStats.anomaly}</h3>
            <span className="chip danger">needs review</span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Stable</p>
            <h3 className="text-success">{normalizedStats.stable}</h3>
            <span className="chip success">steady</span>
          </div>
          <div className="stat-card">
            <p className="stat-label">Unknown</p>
            <h3>{normalizedStats.unknown}</h3>
            <span className="chip muted">waiting data</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">My following</p>
            <h2>Watchlist</h2>
          </div>
          <div className="panel-actions">
            <div className="filter-pills">
              {['all', 'safe', 'anomaly', 'unknown'].map(val => (
                <button
                  key={val}
                  className={`pill ${statusFilter === val ? 'active' : ''}`}
                  onClick={() => setStatusFilter(val)}
                >
                  {val === 'all' ? 'All' : val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              ))}
            </div>
            <span className="badge">{filteredSubscriptions.length} shown</span>
          </div>
        </div>

        {subscriptions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📈</div>
            <h3>No subscriptions yet</h3>
            <p>Search above to add a ticker, or open charts to explore trending symbols.</p>
            <Link to="/chart" className="btn btn-primary">Go to charts</Link>
          </div>
        ) : (
          <div className="subscriptions-grid">
            {filteredSubscriptions.map(sub => (
              <div key={sub.ticker} className="subscription-card">
                <div className="subscription-head">
                  <div>
                    <p className="eyebrow">Ticker</p>
                    <h3 className="ticker">{sub.ticker}</h3>
                    <p className="muted">{sub.frequency}</p>
                  </div>
                  <div className="status-stack">
                    <span className={statusClass(sub.status)}>{sub.status}</span>
                    <button
                      className="icon-btn"
                      onClick={() => handleUnsubscribe(sub.ticker)}
                      aria-label={`Unsubscribe from ${sub.ticker}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="subscription-body">
                  <div className="pill ghost">Frequency: {sub.frequency}</div>
                  <div className="pill ghost">Status: {sub.status}</div>
                </div>

                <div className="subscription-actions">
                  <button
                    className="btn ghost"
                    onClick={() => navigate('/chart', { state: { ticker: sub.ticker } })}
                  >
                    View chart
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => handleUnsubscribe(sub.ticker)}
                  >
                    Unsubscribe
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
