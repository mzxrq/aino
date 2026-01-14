import React, { useState, useEffect } from "react";
import { Trans } from '@lingui/react/macro';

const defaultMenu = [
  // Admin management links
  { key: "admin-dashboard", label: <Trans>Dashboard</Trans>, href: "/admin-dashboard" },
  { key: "admin-anomalies", label: <Trans>Anomalies</Trans>, href: "/anomalies" },
  { key: "admin-users", label: <Trans>Users</Trans>, href: "/users" },
  { key: "admin-subscribers", label: <Trans>Subscribers</Trans>, href: "/subscribers" },
  { key: "admin-marketlists", label: <Trans>Stock List</Trans>, href: "/marketlists" },
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

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user">
            <div className="avatar">{(username && username[0]) || "U"}</div>
            <div className="username">{username || "Guest"}</div>
          </div>
        </div>

        <nav className="menu">
          {menuItems.map((m) => (
            <a key={m.key} className="menu-item" href={m.href}>
              {m.label}
            </a>
          ))}
        </nav>
      </div>
      
      <style>{`
    .sidebar {
      width: 260px;
      background: #111827; /* Darker gray for contrast */
      color: #f3f4f6;
      padding: 20px;
      display: flex;
      flex-direction: column;
      flex-shrink: 0; /* Prevent shrinking in flex container */
      border-right: 1px solid rgba(255,255,255,0.1);
      position: sticky;
      top: 0;
      height: 100vh; /* full viewport height on desktop */
      overflow: auto; /* allow sidebar scrolling if content exceeds viewport */
    }
    
    /* Keep the rest of your logic for mobile toggles */
    .sidebar-header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .user { display:flex; align-items:center; gap:12px }
    .avatar { width:40px; height:40px; border-radius:50%; background:#374151; display:flex; align-items:center; justify-content:center; font-weight:700; color: white; }
    .username { font-size:14px; font-weight:600; color: white; }

    .menu { display:flex; flex-direction:column; gap:4px }
    .menu-item { 
        display:block; 
        padding:10px 16px; 
        color: #9ca3af; 
        text-decoration:none; 
        border-radius:6px; 
        font-size: 14px; 
        font-weight: 500;
        transition: all 0.2s;
    }
    .menu-item:hover { background: rgba(255,255,255,0.05); color:white }
    
    /* Mobile: keep sidebar visible and flow with layout (no toggle) */
    @media (max-width: 899px) {
      .sidebar { position: relative; height: auto; transform: none; z-index: 1; width: 100%; }
    }
`}</style>
    </>
  );
}
