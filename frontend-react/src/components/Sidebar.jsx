import React, { useState, useEffect } from "react";
import { Trans } from '@lingui/react/macro';

const defaultMenu = [
  // Admin management links
  { key: "admin-dashboard", label: <Trans>Dashboard</Trans>, href: "/admin-dashboard" },
  { key: "admin-anomalies", label: <Trans>Anomalies</Trans>, href: "/anomalies" },
  { key: "admin-users", label: <Trans>Users</Trans>, href: "/users" },
  { key: "admin-subscribers", label: <Trans>Subscribers</Trans>, href: "/subscribers" },
  { key: "admin-stocklist", label: <Trans>Stock List</Trans>, href: "/stocklist" },
  { key: "admin-cache", label: <Trans>Cache</Trans>, href: "/cache" },
    { key: "admin-activitylogs", label: <Trans>Activity Logs</Trans>, href: "/activity-logs" },
    { key: "admin-notificationlogs", label: <Trans>Notification Logs</Trans>, href: "/notification-logs" },
    { key: "admin-nodemailerlogs", label: <Trans>Nodemailer Logs</Trans>, href: "/nodemailer-logs" },
    { key: "admin-jobs", label: <Trans>Jobs</Trans>, href: "/jobs" },
];

export default function Sidebar({
  username: propUsername,
  menuItems = defaultMenu,
}) {
  const [username, setUsername] = useState(propUsername || "");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (propUsername) return;
    try {
      const raw = localStorage.getItem("user") || localStorage.getItem("auth");
      if (raw) {
        const u = JSON.parse(raw);
        setUsername(u.name || u.username || u.displayName || u.id || "");
      }
    } catch (_e) {
      // ignore
    }
  }, [propUsername]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <>
      {/* Mobile sidebar toggle button */}
      <button 
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      {/* Overlay backdrop for mobile */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={closeSidebar}
      ></div>

      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="user">
            <div className="avatar">{(username && username[0]) || "U"}</div>
            <div className="username">{username || "Guest"}</div>
          </div>
          <button 
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <nav className="menu">
          {menuItems.map((m) => (
            <a 
              key={m.key} 
              className="menu-item" 
              href={m.href}
              onClick={closeSidebar}
            >
              {m.label}
            </a>
          ))}
        </nav>
      </div>
      
      <style>{`
    .sidebar-toggle {
      display: none;
      position: absolute;
      bottom: 16px;
      left: 16px;
      width: 40px;
      height: 40px;
      border-radius: 6px;
      background: rgba(44, 193, 127, 0.9);
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      z-index: 1900;
    }

    .sidebar-toggle:hover {
      background: rgba(44, 193, 127, 1);
      transform: scale(1.05);
    }

    .sidebar-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1800;
      pointer-events: none;
    }

    .sidebar-overlay.active {
      display: block;
      pointer-events: auto;
    }

    .sidebar {
      width: 260px;
      background: #111827;
      color: #f3f4f6;
      padding: 20px;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      border-right: 1px solid rgba(255,255,255,0.1);
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      min-width: 260px;
    }
    
    .sidebar-header { 
      margin-bottom: 32px; 
      padding-bottom: 16px; 
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .sidebar-close {
      display: none;
      background: none;
      border: none;
      color: rgba(255,255,255,0.7);
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      transition: color 0.2s;
    }

    .sidebar-close:hover {
      color: white;
    }

    .user { 
      display: flex; 
      align-items: center; 
      gap: 12px;
      flex: 1;
    }

    .avatar { 
      width: 40px; 
      height: 40px; 
      border-radius: 50%; 
      background: #374151; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-weight: 700; 
      color: white;
      flex-shrink: 0;
    }

    .username { 
      font-size: 14px; 
      font-weight: 600; 
      color: white;
    }

    .menu { 
      display: flex; 
      flex-direction: column; 
      gap: 4px;
    }

    .menu-item { 
      display: block; 
      padding: 10px 16px; 
      color: #9ca3af; 
      text-decoration: none; 
      border-radius: 6px; 
      font-size: 14px; 
      font-weight: 500;
      transition: all 0.2s;
    }

    .menu-item:hover { 
      background: rgba(255,255,255,0.05); 
      color: white;
    }
    
    /* Medium screens - hide sidebar */
    @media (max-width: 899px) {
      .sidebar { 
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        z-index: 1850;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        width: 260px;
        min-width: 260px;
      }

      .sidebar.open {
        display: flex;
        transform: translateX(0);
      }

      .sidebar-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sidebar-close {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sidebar-header {
        margin-bottom: 24px;
        padding-bottom: 12px;
      }
    }

    /* Ensure button shows on all smaller breakpoints */
    @media (max-width: 768px) {
      .sidebar-toggle {
        display: flex !important;
        position: fixed !important;
        bottom: calc(env(safe-area-inset-bottom) + 16px) !important;
        left: 16px !important;
        z-index: 1900 !important;
      }
    }

    @media (max-width: 480px) {
      .sidebar-toggle {
        display: flex !important;
        position: fixed !important;
        bottom: calc(env(safe-area-inset-bottom) + 16px) !important;
        left: 16px !important;
        z-index: 1900 !important;
      }
    }
`}</style>
    </>
  );
}
