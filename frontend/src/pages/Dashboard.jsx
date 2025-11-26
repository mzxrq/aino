import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css';

export default function Dashboard() {
  const { user, token, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const NODE_API_URL = "http://localhost:5050";

  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchSubscriptions = async () => {
      setIsLoading(true);
      try {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const url = `${NODE_API_URL}/dashboard/${user.userId}`;
        const response = await fetch(url, { headers });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data = await response.json();

        // Normalize to array (API might return object with `tickers` array)
        const tickersArray = Array.isArray(data) ? data : data.tickers || [];
        setSubscriptions(tickersArray);

      } catch (err) {
        console.error("Failed to fetch subscriptions:", err);
        setSubscriptions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscriptions();
  }, [user, token, navigate]);

  const handleUnsubscribe = async (ticker) => {
    if (!window.confirm(`Unsubscribe from ${ticker}?`)) return;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`http://localhost:5050/subscriptions/`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ lineID: user.userId, tickers: [ticker] })
      });

      if (!response.ok) throw new Error('Failed to unsubscribe');

      setSubscriptions(subs => subs.filter(t => t !== ticker));

    } catch (err) {
      console.error("Unsubscribe error:", err);
      alert("Failed to unsubscribe. Please try again.");
    }
  };

  if (isLoading || !user) {
    return <div className="dashboard-container"><h1>Loading Dashboard...</h1></div>;
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
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.length > 0 ? (
              subscriptions.map(ticker => (
                <tr key={ticker}>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => navigate('/chart', { state: { ticker } })}
                    >
                      {ticker}
                    </button>
                  </td>
                  <td>
                    <span className="status-badge status-unknown">Unknown</span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleUnsubscribe(ticker)}
                      className="btn btn-danger"
                    >
                      Unsubscribe
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3">No subscriptions found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
