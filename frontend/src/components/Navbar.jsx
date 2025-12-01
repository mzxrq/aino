import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';
import Search from './Search';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'light');
  const { user, isLoggedIn, logout } = useAuth();
  // no pin/collapsed behavior: navbar is static/sticky full-width

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

  useEffect(() => {
    // Dynamically calculate and update navbar height CSS variable
    const updateNavHeight = () => {
      const navElement = document.querySelector('.navbar');
      if (navElement) {
        const height = navElement.offsetHeight;
        document.documentElement.style.setProperty('--nav-height', `${height}px`);
      }
    };

    // Calculate on mount and whenever navbar might resize
    updateNavHeight();
    const resizeObserver = new ResizeObserver(updateNavHeight);
    const navElement = document.querySelector('.navbar');
    if (navElement) resizeObserver.observe(navElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Close menu when navigating (for mobile UX)
  const handleNavClick = () => setMenuOpen(false);

  return (
    <nav className={`navbar`}>
      {/* <div className="navbar-left">
        <Link to="/" className="logo">Placeholder</Link>
      </div> */}

      <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">
        <span className="hamburger">☰</span>
      </button>

      <div className={`nav-links${menuOpen ? ' open' : ''}`}>
        <Link to="/chart" className="nav-link" onClick={handleNavClick}>Chart</Link>
        <Link to="/list" className="nav-link" onClick={handleNavClick}>Market List</Link>
        {isLoggedIn ? (
          <>
            <Link to="/dashboard" className="nav-link" onClick={handleNavClick}>Dashboard</Link>
            <Link to="/profile" className="nav-link profile-link" onClick={handleNavClick}>Profile</Link>
          </>
        ) : (
          <Link to="/login" className="nav-link" onClick={handleNavClick}></Link>
        )}
        <div className="mobile-search">
          <Search />
        </div>
      </div>
      <div className="search-inline"><Search /></div>
      <div className="nav-actions">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>
        {isLoggedIn ? (
          <>
            <Link to="/profile" className="profile-avatar-link" onClick={handleNavClick}>
              {user && (user.pictureUrl || user.avatar) ? (
                <img src={user.pictureUrl || user.avatar} alt="profile" className="profile-avatar" />
              ) : (
                <span className="profile-avatar-placeholder">{user && user.name ? user.name[0].toUpperCase() : 'U'}</span>
              )}
            </Link>
            <button onClick={logout} className="btn btn-outline">Logout</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-login" onClick={handleNavClick}>Login</Link>
        )}
      </div>
    </nav>
  );
}