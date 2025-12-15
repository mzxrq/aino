import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import '../css/Navbar.css';
import Search from './Search';
import logoSvg from '../assets/aino.svg';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    try {
      return (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'light';
    } catch (e) {
      void e;
      return 'light';
    }
  });
  const { user, isLoggedIn, logout } = useAuth();
  const isAdmin =
  user && (user.role === 'admin' || user.role === 'superadmin');

  // no pin/collapsed behavior: navbar is static/sticky full-width

  useEffect(() => {
    // Apply theme class to body whenever `theme` changes
    try {
      if (theme === 'dark') document.body.classList.add('dark');
      else document.body.classList.remove('dark');
    } catch (e) {
      void e;
    }
  }, [theme]);

  useEffect(() => {
    // Scroll detection for homepage logo visibility
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('theme', next); } catch (e) { void e; }
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

  const isHomepage = location.pathname === '/';
  const showLogo = !isHomepage || scrolled;

  return (
    <nav className={`navbar`}>
      <div className="navbar-left">
        <Link to="/" className={`logo ${showLogo ? '' : 'hidden'}`}>
          <img src={logoSvg} alt="Logo" className="logo-img" />
        </Link>
      </div>

      <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">
        <span className="hamburger">☰</span>
      </button>

      <div className={`nav-links${menuOpen ? ' open' : ''}`}>
        <Link to="/chart" className="nav-link" onClick={handleNavClick}>Chart</Link>
        <Link to="/list" className="nav-link" onClick={handleNavClick}>Market List</Link>
        <Link to="/monitoring" className="nav-link" onClick={handleNavClick}>Monitoring</Link>
        {isLoggedIn ? (
          <>
            <Link to="/dashboard" className="nav-link" onClick={handleNavClick}>Dashboard</Link>
            {isAdmin && (
  <Link
    to="/anomalies"
    className="nav-link admin-link"
    onClick={handleNavClick}
  >
    🚨 Anomalies
  </Link>
)}

            <Link to="/profile" className="nav-link profile-link" onClick={handleNavClick}>Profile</Link>
          </>
        ) : (
          <></>
        )}
        <div className="mobile-search">
          <Search />
        </div>
      </div>
      <div className="search-inline"><Search /></div>
      <div className="nav-actions">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle color theme">
          {theme === 'dark' ? (
            // Moon icon
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21.64 13.01A9 9 0 0 1 11 2.36a1 1 0 0 0-1.33 1.22 7 7 0 1 0 10.75 10.75 1 1 0 0 0 1.22-1.32Z"/>
            </svg>
          ) : (
            // Sun icon
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zm10.48 14.32l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM12 4V1h-0v3h0zm0 19v-3h0v3h0zM4 12H1v0h3v0zm19 0h-3v0h3v0zM6.76 19.16l-1.42 1.42-1.79-1.8 1.41-1.41 1.8 1.79zM19.16 6.76l1.4-1.4 1.8 1.79-1.41 1.41-1.79-1.8zM12 6a6 6 0 100 12 6 6 0 000-12z"/>
            </svg>
          )}
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