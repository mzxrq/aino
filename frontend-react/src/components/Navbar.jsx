import React, { useState, useEffect, useRef } from 'react';
import { Trans } from '@lingui/react/macro';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { i18n } from '@lingui/core';
import API_BASE from '../config/api';
import '../css/Navbar.css';
import '../css/ProfileDropdown.css';
import "@theme-toggles/react/css/Expand.css";
import { Expand } from "@theme-toggles/react";
import logoSvg from '../assets/aino.svg';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const profileMenuRef = useRef(null);
  const profileAvatarRef = useRef(null);

  // Helper to construct full image URL
  const getImageUrl = (imgPath) => {
    if (!imgPath) return null;
    if (imgPath.startsWith('http')) return imgPath; // Already absolute
    return `${API_BASE}${imgPath.startsWith('/') ? imgPath : '/' + imgPath}`;
  };

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch (e) {
      return 'light';
    }
  });

  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem('locale') || 'en';
    } catch (e) {
      return 'en';
    }
  });

  useEffect(() => {
    if (theme === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
    const loadLocale = async () => {
      try {
        const { messages } = await import(`../locales/${locale}/messages.js`);
        i18n.load(locale, messages);
        i18n.activate(locale);
      } catch (e) {
        console.error('Failed to load locale:', locale, e);
      }
    };
    loadLocale();
  }, [locale]);

  const switchLocale = (newLocale) => {
    setLocale(newLocale);
    try { localStorage.setItem('locale', newLocale); } catch (e) { void e; }
    setProfileMenuOpen(false);
  };

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

  useEffect(() => {
    // Close profile menu when clicking outside
    const handleClickOutside = (e) => {
      if (profileMenuOpen && 
          profileMenuRef.current && 
          !profileMenuRef.current.contains(e.target) &&
          profileAvatarRef.current &&
          !profileAvatarRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

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
        <Link to="/chart" className="nav-link" onClick={handleNavClick}><Trans>Chart</Trans></Link>
        <Link to="/list" className="nav-link" onClick={handleNavClick}><Trans>Market List</Trans></Link>
        {isLoggedIn ? (
          <>
            <Link to="/dashboard" className="nav-link" onClick={handleNavClick}><Trans>Dashboard</Trans></Link>
            {isAdmin && (
            <>
              <Link to="/anomalies" className="nav-link admin-link" onClick={handleNavClick}>
                <Trans>Anomalies</Trans>
              </Link>
              <Link to="/admin-dashboard" className="nav-link admin-link" onClick={handleNavClick}>
                <Trans>Admin Dashboard</Trans>
              </Link>
            </>
        )}

            <Link to="/profile" className="nav-link profile-link" onClick={handleNavClick}><Trans>Profile</Trans></Link>
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
                const front = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5050';
                const res = await fetch(`${front}/node/python-integrate/scan-all`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
                  body: JSON.stringify({})
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) {
                  alert(i18n._('Scan request failed: ') + (j.error || res.statusText));
                } else {
                  alert(i18n._('Full scan started'));
                }
              } catch (e) {
                console.error('Run scan error', e);
                alert(i18n._('Failed to start scan: ') + e.message);
              }
            }}
          >
            <Trans>Full Scan</Trans>
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button 
            ref={profileAvatarRef}
            className="profile-avatar-button" 
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            aria-label="Profile menu"
          >
            {isLoggedIn && user && (user.pictureUrl || user.avatar) ? (
              <img src={getImageUrl(user.pictureUrl || user.avatar)} alt="profile" className="profile-avatar" />
            ) : isLoggedIn ? (
              <span className="profile-avatar-placeholder">{user && user.name ? user.name[0].toUpperCase() : 'U'}</span>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            )}
          </button>
          {profileMenuOpen && (
            <div ref={profileMenuRef} className="profile-dropdown">
              {isLoggedIn ? (
                <>
                  <div className="profile-dropdown-header">
                    <div className="profile-dropdown-user">
                      {user && (user.pictureUrl || user.avatar) ? (
                        <img src={getImageUrl(user.pictureUrl || user.avatar)} alt="profile" className="profile-dropdown-avatar" />
                      ) : (
                        <span className="profile-dropdown-avatar-placeholder">{user && user.name ? user.name[0].toUpperCase() : 'U'}</span>
                      )}
                      <div className="profile-dropdown-info">
                        <div className="profile-dropdown-name">{user?.name || 'User'}</div>
                        <div className="profile-dropdown-email">{user?.email || ''}</div>
                      </div>
                    </div>
                  </div>
                  <div className="profile-dropdown-divider"></div>
                  <div className="profile-dropdown-item" onClick={() => toggleTheme()}>
                    <Expand
                      size={18}
                      duration={750}
                      toggled={theme === 'dark'}
                    />
                    <span><Trans>Theme</Trans></span>
                    <span className="profile-dropdown-item-value">{theme === 'dark' ? <Trans>Dark</Trans> : <Trans>Light</Trans>}</span>
                  </div>
                  <div className="profile-dropdown-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span><Trans>Language</Trans></span>
                    <select 
                      className="profile-dropdown-select" 
                      value={locale} 
                      onChange={(e) => switchLocale(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                    </select>
                  </div>
                  <Link to="/profile" className="profile-dropdown-item" onClick={() => setProfileMenuOpen(false)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span><Trans>Settings</Trans></span>
                  </Link>
                  <div className="profile-dropdown-divider"></div>
                  <div className="profile-dropdown-item profile-dropdown-logout" onClick={() => { logout(); setProfileMenuOpen(false); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    <span><Trans>Logout</Trans></span>
                  </div>
                </>
              ) : (
                <>
                  <div className="profile-dropdown-header">
                    <div className="profile-dropdown-user">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      <div className="profile-dropdown-info">
                        <div className="profile-dropdown-name"><Trans>Please sign in to continue</Trans></div>
                      </div>
                    </div>
                  </div>
                  <div className="profile-dropdown-divider"></div>
                  <div className="profile-dropdown-item" onClick={() => toggleTheme()}>
                    <Expand
                      size={18}
                      duration={750}
                      toggled={theme === 'dark'}
                    />
                    <span><Trans>Theme</Trans></span>
                    <span className="profile-dropdown-item-value">{theme === 'dark' ? <Trans>Dark</Trans> : <Trans>Light</Trans>}</span>
                  </div>
                  <div className="profile-dropdown-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span><Trans>Language</Trans></span>
                    <select 
                      className="profile-dropdown-select" 
                      value={locale} 
                      onChange={(e) => switchLocale(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                    </select>
                  </div>
                  <div className="profile-dropdown-divider"></div>
                  <Link to="/login" className="profile-dropdown-item" onClick={() => setProfileMenuOpen(false)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                      <polyline points="10 17 15 12 10 7"/>
                      <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    <span><Trans>Sign in</Trans></span>
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}