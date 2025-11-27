import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css';

export default function Dashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const NODE_API_URL = "http://localhost:5050";

  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading || !user) {
    return (
      <div className="dashboard-container">
        <h1>Loading Dashboard...</h1>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <h1>My Dashboard</h1>
      <p>Welcome, {user.displayName}! Here are your stock subscriptions.</p>

      <div className="search-bar-container">
        <input type="text" placeholder="Search for a new ticker (e.g., AAPL)" />
        <Link to="/chart" className="btn btn-primary">Search</Link>
      </div>

      <h2>My Subscriptions</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Stock Ticker</th>
              <th>Frequency</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.length === 0 ? (
              <tr><td colSpan="4">No subscriptions found</td></tr>
            ) : subscriptions.map(sub => (
              <tr key={sub.ticker}>
                <td>
                  <button
                    className="link-button"
                    onClick={() => navigate("/chart", { state: { ticker: sub.ticker } })}
                  >
                    {sub.ticker}
                  </button>
                </td>
                <td>{sub.frequency}</td>
                <td>
                  <span className={`status-badge status-${sub.status.toLowerCase()}`}>
                    {sub.status}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleUnsubscribe(sub.ticker)}
                  >
                    Unsubscribe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
