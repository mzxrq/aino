import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';
import Search from './Search';

export default function Navbar() {
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [forceExpanded, setForceExpanded] = useState(false);
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'light');
  const { user, isLoggedIn, logout } = useAuth();
  const hoverTimer = useRef(null);

  const handleMouseEnter = () => {
    if (forceExpanded) return; // don't auto-collapse if manually pinned
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    hoverTimer.current = setTimeout(() => setCollapsed(false), 80);
  };

  const handleMouseLeave = () => {
    if (forceExpanded) return; // don't auto-collapse if manually pinned
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    hoverTimer.current = setTimeout(() => setCollapsed(true), 180);
  };

  const toggleNavbarPin = () => {
    setForceExpanded(!forceExpanded);
    if (!forceExpanded) setCollapsed(false); // expand when pinning
  };

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
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <nav className={`navbar ${collapsed && !forceExpanded ? 'collapsed' : 'expanded'}`} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* <div className="navbar-left">
        <Link to="/" className="logo">Placeholder</Link>
      </div> */}
      
      <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
        <span className="hamburger">☰</span>
      </button>

      <div className={`navbar-left nav-links ${menuOpen ? 'open' : ''}`}>
        <Link to="/chart" className="nav-link">Chart</Link>
        <Link to="/list" className="nav-link">Market List</Link>
        {isLoggedIn && (
          <>
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/profile" className="nav-link profile-link">Profile</Link>
          </>
        )}
      </div>
        <Search />
      <div className="nav-actions">
        <button className="navbar-pin-toggle" onClick={toggleNavbarPin} title={forceExpanded ? 'Minimize navbar' : 'Expand navbar'}>
          {forceExpanded ? '📌' : '◯'}
        </button>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>
        {isLoggedIn ? (
          <>
            {user && user.avatar ? (
              <Link to="/profile" className="profile-avatar-link">
                <img src={user.avatar} alt="profile" className="profile-avatar" />
              </Link>
            ) : (
              <Link to="/profile" className="profile-avatar-placeholder">{user && user.name ? user.name[0].toUpperCase() : 'U'}</Link>
            )}
            <button onClick={logout} className="btn btn-outline">Logout</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-login">Login</Link>
        )}
      </div>
    </nav>
  );
}