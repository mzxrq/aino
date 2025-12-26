import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

// 1. Import Auth Provider
import { AuthProvider } from "./context/AuthContext";

// 2. Import Components
import Navbar from "./components/Navbar";

// 3. Import Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chart from "./pages/Chart";
import LargeChart from "./pages/MainChart";
import LineCallback from "./pages/LineCallback";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import CompanyProfile from "./pages/CompanyProfile";
import Compare from "./pages/Compare";
import MarketList from "./pages/MarketList";
import MonitoringDashboard from "./pages/MonitoringDashboard";

import AdminRoute from "./pages/Admin/AdminRouteGuard";
import AdminLayout from "../src/layouts/AdminLayout";
import AnomaliesManagementPage from "./pages/Admin/AdminAnomaliesPage";
import CacheManagementPage from "./pages/Admin/AdminCachePage";
import MarketlistsManagementPage from "./pages/Admin/AdminMarketlistsPage";
import UsersManagementPage from "./pages/Admin/AdminUsersPage";
import SubscribersManagementPage from "./pages/Admin/AdminSubscribersPage";
import AdminDashboardPage from "./pages/Admin/AdminDashboardPage";

function App() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      try {
        // ignore clicks on actionable controls inside cards
        if (e.target.closest('button, a, input, .action-icon, .menu-btn')) return;
        const card = e.target.closest('.stock-card') || e.target.closest('.stock-card-detailed');
        if (!card) return;

        // Attempt to extract ticker from known selectors
        let ticker = null;
        const tickerEl = card.querySelector('.stock-ticker');
        if (tickerEl && tickerEl.textContent) {
          ticker = tickerEl.textContent.trim().split(/\s+/)[0];
        }
        if (!ticker) {
          const img = card.querySelector('.stock-logo img[alt]');
          if (img) ticker = (img.getAttribute('alt') || '').trim().split(/\s+/)[0];
        }
        if (!ticker) return;

        navigate(`/chart/u/${encodeURIComponent(ticker)}`);
      } catch (err) { /* swallow */ }
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [navigate]);
  return (

    
    // Wrap the *entire app* in AuthProvider
    <AuthProvider>
      <div
        style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      >
        {/* Background wrapper so the page background extends under the transparent navbar */}
        <div className="page-background" style={{ background: "var(--bg-secondary)", display: 'flex', flexDirection: 'column', minHeight: '0' }}>
          <Navbar />

          {/* The main content area that changes (transparent to let background show through) */}
          <div className="main-content container-centered"
            style={{
              flex: 1,
              overflow: "auto",
              background: "transparent",
            }}
          >
          <Routes>
            {/* 🔐 ADMIN ONLY */}
            <Route element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route
                  path="/anomalies"
                  element={<AnomaliesManagementPage />}
                />
                <Route path="/admin-dashboard" element={<AdminDashboardPage />} />
                <Route path="/cache" element={<CacheManagementPage />} />
                <Route path="/marketlists" element={<MarketlistsManagementPage />} />
                <Route path="/monitoring" element={<MonitoringDashboard />} />
                <Route path="/users" element={<UsersManagementPage />} />
                <Route path="/subscribers" element={<SubscribersManagementPage />} />
              </Route>
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/chart/u/:ticker" element={<LargeChart />} />
            <Route path="/chart/u" element={<LargeChart />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/company/:ticker" element={<CompanyProfile />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/list" element={<MarketList />} />

            {/* The "invisible" page LINE redirects to */}
            <Route path="/auth/callback" element={<LineCallback />} />
          </Routes>
          </div>
          </div>
        </div>
    </AuthProvider>
  );
}

export default App;
