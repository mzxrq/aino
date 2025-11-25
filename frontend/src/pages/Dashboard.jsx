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

        const response = await fetch('http://localhost:5050/subscribers', {
          headers
        });

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

      // If successful, remove it from the list in the UI
      setSubscriptions(subs => subs.filter(s => s.id !== subscriptionId));

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
            {subscriptions.map(sub => (
              <tr key={sub.id}>
                <td>
                  <Link to={`/chart?ticker=${sub.ticker}`}>{sub.ticker}</Link>
                </td>
                <td>{sub.frequency}</td>
                <td>
                  <span className={`status-badge status-${sub.status.toLowerCase()}`}>
                    {sub.status}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => handleUnsubscribe(sub.id)} // <-- Pass sub.id
                    className="btn btn-danger"
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