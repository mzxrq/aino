import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Dashboard.css'; // We'll create this

// Mock data for subscriptions - WE ARE REMOVING THIS
// const MOCK_SUBSCRIPTIONS = [ ... ];

export default function Dashboard() {
  const { user, token, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Redirect to login if user data isn't loaded
    if (!user) {
      navigate('/login');
      return;
    }

    // --- Fetch Subscriptions ---
    const fetchSubscriptions = async () => {
      setIsLoading(true);

      try {
        // --- THIS IS THE NEW API CALL ---
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const url = token ? 'http://localhost:5050/subscriptions/me' : 'http://localhost:5050/subscriptions';
        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        // Assuming Anupap's API returns a list: [ { id: '...', ticker: '...' }, ... ]
        setSubscriptions(data);

      } catch (err) {
        console.error("Failed to fetch subscriptions:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscriptions();
  }, [user, token, navigate]); // Run this effect if user or token changes

  const handleUnsubscribe = async (subscriptionId) => {
    alert(`Unsubscribing from ${subscriptionId}...`);

    try {
      // --- NEW: API call to delete ---
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`http://localhost:5050/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        throw new Error('Failed to unsubscribe');
      }

      // If successful, remove it from the list in the UI (match id or Mongo _id)
      setSubscriptions(subs => subs.filter(s => {
        if (!s) return false;
        if (s.id && s.id === subscriptionId) return false;
        if (s._id && (s._id === subscriptionId || (s._id.$oid && s._id.$oid === subscriptionId))) return false;
        return true;
      }));

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
              <th>Frequency</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map(sub => {
              const status = (sub && sub.status) ? String(sub.status) : 'Unknown';
              const frequency = (sub && sub.frequency) ? sub.frequency : 'N/A';
              const ticker = (sub && sub.ticker) ? sub.ticker : (sub && sub.symbol) ? sub.symbol : 'UNKNOWN';
              const id = sub && (sub.id || (sub._id && sub._id.toString())) ? (sub.id || (sub._id && sub._id.toString())) : undefined;
              return (
                <tr key={id || ticker}>
                  <td>
                    <button className="link-button" onClick={() => navigate('/chart', { state: { ticker } })}>{ticker}</button>
                  </td>
                  <td>{frequency}</td>
                  <td>
                    <span className={`status-badge status-${status.toLowerCase()}`}>
                      {status}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => { if (id) handleUnsubscribe(id); else alert('Cannot unsubscribe: missing id'); }}
                      className="btn btn-danger"
                    >
                      Unsubscribe
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}