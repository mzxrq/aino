import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { isLoggedIn, logout, user } = useAuth(); // <-- Get user

  return (
    <nav className="navbar">
      <Link to="/" className="logo">
        <span role="img" aria-label="bolt">⚡</span> Anomaly Detector
      </Link>
      <div className="nav-links">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/chart" className="nav-link">Chart</Link>
        {isLoggedIn && (
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
        )}
      </div>
      <div className="nav-actions">
        {isLoggedIn ? (
          <>
            {/* --- ADDED PROFILE LINK/IMAGE --- */}
            <Link to="/profile" className="nav-profile">
              {user && user.pictureUrl ? (
                <img src={user.pictureUrl} alt="Profile" className="nav-avatar" />
              ) : (
                <span>Profile</span>
              )}
            </Link>
            <button onClick={logout} className="btn btn-outline">Logout</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary">Log In</Link>
        )}
      </div>
    </nav>
  );
}