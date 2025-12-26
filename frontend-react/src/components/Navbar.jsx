import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import '../css/Navbar.css';
import "@theme-toggles/react/css/Expand.css";
import { Expand } from "@theme-toggles/react";
import logoSvg from '../assets/aino.svg';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch (e) {
      return 'light';
    }
  });

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, [theme]);

  const { isLoggedIn, isAdmin, token, user, logout } = useAuth() || {};

  useEffect(() => {
    // Scroll detection for homepage logo visibility
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { passive: true });
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

  // refs for controlling SVG SMIL animations programmatically
  const pathOpenAnimRef = useRef(null);
  const pathCloseAnimRef = useRef(null);
  const themeIconRef = useRef(null);
  const animCxForwardRef = useRef(null);
  const animCyForwardRef = useRef(null);
  const animCxReverseRef = useRef(null);
  const animCyReverseRef = useRef(null);

  // JS fallback animator for browsers without SMIL support
  const animateMaskFallback = (maskCircle, fromX, fromY, toX, toY, duration = 320) => {
    if (!maskCircle) return Promise.resolve();
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);
        const cx = fromX + (toX - fromX) * eased;
        const cy = fromY + (toY - fromY) * eased;
        try {
          maskCircle.setAttribute('cx', String(cx));
          maskCircle.setAttribute('cy', String(cy));
        } catch (e) {
          // ignore
        }
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  };

  useEffect(() => {
    // When menuOpen changes, trigger the matching SVG animation
    try {
      if (menuOpen) {
        if (pathOpenAnimRef.current && typeof pathOpenAnimRef.current.beginElement === 'function') {
          pathOpenAnimRef.current.beginElement();
        }
      } else {
        if (pathCloseAnimRef.current && typeof pathCloseAnimRef.current.beginElement === 'function') {
          pathCloseAnimRef.current.beginElement();
        }
      }
    } catch (e) {
      // ignore if SVG SMIL not supported
      void e;
    }
  }, [menuOpen]);

  return (
    <nav className={`navbar`}>
      <div className="navbar-left">
        <Link to="/" className={`logo`} aria-label="Home">
          <img src={logoSvg} alt="Logo" className="logo-img" />
        </Link>
      </div>

      <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">
        <svg className="hb" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" stroke="#eee" strokeWidth=".6" fill="none" strokeLinecap="round" style={{ cursor: 'pointer' }}>
          <path d="M2,3L5,3L8,3M2,5L8,5M2,7L5,7L8,7">
            <animate
              ref={pathOpenAnimRef}
              dur="0.2s"
              attributeName="d"
              values="M2,3L5,3L8,3M2,5L8,5M2,7L5,7L8,7;M3,3L5,5L7,3M5,5L5,5M3,7L5,5L7,7"
              fill="freeze"
            />
            <animate
              ref={pathCloseAnimRef}
              dur="0.2s"
              attributeName="d"
              values="M3,3L5,5L7,3M5,5L5,5M3,7L5,5L7,7;M2,3L5,3L8,3M2,5L8,5M2,7L5,7L8,7"
              fill="freeze"
            />
          </path>
        </svg>
      </button>
      <div className={`nav-links${menuOpen ? ' open' : ''}`}>
        <Link to="/chart" className="nav-link" onClick={handleNavClick}>Chart</Link>
        <Link to="/list" className="nav-link" onClick={handleNavClick}>Market List</Link>
        {isLoggedIn ? (
          <>
            <Link to="/dashboard" className="nav-link" onClick={handleNavClick}>Dashboard</Link>
            {isAdmin && (
            <>
              <Link to="/anomalies" className="nav-link admin-link" onClick={handleNavClick}>
                Anomalies
              </Link>
              <Link to="/monitoring" className="nav-link" onClick={handleNavClick}>
                Monitoring
              </Link>
            </>
        )}

            <Link to="/profile" className="nav-link profile-link" onClick={handleNavClick}>Profile</Link>
          </>
        ) : (
          <></>
        )}
      </div>
      <div className="nav-actions">
        {isAdmin && (
          <button
            className="btn btn-danger"
            title="Scan Anomaly"
            onClick={async () => {
              try {
                const front = import.meta.env.VITE_API_URL || 'http://localhost:5050';
                const res = await fetch(`${front}/node/admin/scan-all`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
                  body: JSON.stringify({})
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) {
                  alert('Scan request failed: ' + (j.error || res.statusText));
                } else {
                  alert('Full scan started');
                }
              } catch (e) {
                console.error('Run scan error', e);
                alert('Failed to start scan: ' + e.message);
              }
            }}
          >
            Full Scan
          </button>
        )}
        <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Expand
            size={20}
            duration={750}
            toggled={theme === 'dark'}
            onToggle={() => toggleTheme()}
          />
        </div>
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