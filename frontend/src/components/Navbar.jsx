import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';
import Search from './Search';

export default function Navbar() {
  const { isLoggedIn, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'light');

  useEffect(() => {
    // Apply persisted theme on mount
    try {
      const t = localStorage.getItem('theme') || theme;
      if (t === 'dark') document.body.classList.add('dark');
      else document.body.classList.remove('dark');
      setTheme(t);
    } catch (e) {
      // ignore in SSR or restricted env
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('theme', next); } catch (e) { }
    if (next === 'dark') document.body.classList.add('dark'); else document.body.classList.remove('dark');
  };

  return (
    <nav className="navbar">
      {/* <div className="navbar-left">
        <Link to="/" className="logo">Placeholder</Link>
      </div> */}
      
      <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
        ☰
      </button>

      <div className={`navbar-left nav-links ${menuOpen ? 'open' : ''}`}>
        <Link to="/chart" className="nav-link">Chart</Link>
        <Link to="/list" className="nav-link">Market List</Link>
        {isLoggedIn && (
          <>
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/profile" className="nav-link">Profile</Link>
          </>
        )}
      </div>
        <Search />
      <div className="nav-actions">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>
        {isLoggedIn ? (
          <button onClick={logout} className="btn btn-outline">Logout</button>
        ) : (
          <Link to="/login" className="btn btn-login">Login</Link>
        )}
      </div>
    </nav>
  );
}