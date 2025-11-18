import React from 'react';
import { useAuth } from '../context/AuthContext';

// Placeholder for your Dashboard/Subscriptions page
export default function Dashboard() {
  const { user } = useAuth();

  if (!user) {
    return <h1>Please log in to see your dashboard.</h1>;
  }

  return (
    <div style={{ padding: '2rem 4rem' }}>
      <h1>My Dashboard</h1>
      <p>Welcome, {user.displayName}!</p>
      <h2>My Subscriptions</h2>
      <ul>
        <li>AAPL (Daily) - Status: Safe</li>
        <li>9020.T (Weekly) - Status: ANOMALY</li>
      </ul>
      {/* This is where you would build the list from your wireframe */}
    </div>
  );
}