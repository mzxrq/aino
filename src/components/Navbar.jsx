import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { isLoggedIn, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="logo">STAD</Link>
      </div>

      <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
        ☰
      </button>

      <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
        <Link to="/" className="nav-link">Search Tickers</Link>
        <Link to="/market" className="nav-link">Market List</Link>
        {isLoggedIn && (
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
        )}
      </div>

      <div className="nav-actions">
        {isLoggedIn ? (
          <button onClick={logout} className="btn btn-outline">Logout</button>
        ) : (
          <Link to="/login" className="btn btn-primary">Login with ✔</Link>
        )}
      </div>
    </nav>
  );
}