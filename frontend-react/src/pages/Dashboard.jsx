import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useNavigate } from 'react-router-dom';
import Swal from '../utils/muiSwal';
import '../css/Dashboard.css';

const NODE_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5050";

export default function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

        // Sort by ticker name
        setSubscriptions(normalizedSubs.sort((a, b) => a.ticker.localeCompare(b.ticker)));
      } catch (err) {
        console.error("Failed to fetch subscriptions:", err);
        setSubscriptions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscriptions();
  }, [user, token, navigate]);

  const getStatusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('anomaly')) return 'status-anomaly';
    if (s.includes('safe') || s.includes('active')) return 'status-safe';
    return 'status-unknown';
  };

  // Filter by search query
  const filteredSubscriptions = subscriptions.filter(sub =>
    sub.ticker.toUpperCase().includes(searchQuery.toUpperCase())
  );

  // Handle unsubscribe
  const handleUnsubscribe = async (ticker) => {
    const result = await Swal.fire({
      title: 'Unsubscribe',
      text: `Remove ${ticker} from your watchlist?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Remove'
    });

    if (!result.isConfirmed) return;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${NODE_API_URL}/node/subscribers`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: user.id || user.userId, tickers: [ticker] }),
      });

      if (!response.ok) throw new Error('Failed to unsubscribe');

      setSubscriptions(subs => subs.filter(s => s.ticker !== ticker));
      
      await Swal.fire({
        icon: 'success',
        title: 'Removed',
        text: `${ticker} removed from watchlist.`,
        timer: 1200,
        confirmButtonColor: '#00aaff'
      });
    } catch (err) {
      console.error("Unsubscribe error:", err);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to unsubscribe. Please try again.',
        confirmButtonColor: '#dc2626'
      });
    }
  };

  const handleViewChart = (ticker) => {
    navigate('/chart', { state: { ticker } });
  };

  if (isLoading || !user) {
    return (
      <div className="dashboard-shell">
        <div className="loading-state">
          <p>Loading watchlist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      {/* Header Section */}
      <div className="dashboard-header">
        <div>
          <h1>My Watchlist</h1>
          <p className="text-secondary">{subscriptions.length} {subscriptions.length === 1 ? 'stock' : 'stocks'} followed</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/chart')}>+ Add Stock</button>
      </div>

      {/* Search/Filter */}
      <div className="dashboard-toolbar">
        <input
          type="text"
          placeholder="Search by ticker..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-box"
        />
        <span className="results-count">{filteredSubscriptions.length} results</span>
      </div>

      {/* Content */}
      {subscriptions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h2>No stocks yet</h2>
          <p>Start building your watchlist by exploring the market</p>
          <button className="btn btn-primary" onClick={() => navigate('/chart')}>Browse Markets</button>
        </div>
      ) : filteredSubscriptions.length === 0 ? (
        <div className="empty-state">
          <p>No results for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="stocks-table">
          <div className="table-header">
            <div className="col-ticker">Ticker</div>
            <div className="col-status">Status</div>
            <div className="col-frequency">Frequency</div>
            <div className="col-actions">Actions</div>
          </div>
          
          {filteredSubscriptions.map(sub => (
            <div key={sub.ticker} className="table-row">
              <div className="col-ticker">
                <span className="ticker-name">{sub.ticker}</span>
              </div>
              <div className="col-status">
                <span className={`status-badge ${getStatusClass(sub.status)}`}>
                  {sub.status}
                </span>
              </div>
              <div className="col-frequency">
                <span className="frequency-text">{sub.frequency}</span>
              </div>
              <div className="col-actions">
                <button
                  className="btn-icon"
                  onClick={() => handleViewChart(sub.ticker)}
                  title="View chart"
                >
                  📈
                </button>
                <button
                  className="btn-icon danger"
                  onClick={() => handleUnsubscribe(sub.ticker)}
                  title="Remove from watchlist"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
