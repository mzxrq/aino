import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// 1. Import Auth Provider
import { AuthProvider } from "./context/AuthContext";

// 2. Import Components
import Navbar from "./components/Navbar";

// 3. Import Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chart from "./pages/Chart";
import LargeChart from "./pages/LargeChart";
import LineCallback from "./pages/LineCallback";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import MarketList from "./pages/MarketList";
import MonitoringDashboard from "./pages/MonitoringDashboard";

import AdminRoute from "./pages/Admin/AdminRouteGuard";
import AdminLayout from "../src/layouts/AdminLayout";
import AnomaliesManagementPage from "./pages/Admin/AdminAnomaliesPage";
import CacheManagementPage from "./pages/Admin/AdminCachePage";
import MarketlistsManagementPage from "./pages/Admin/AdminMarketlistsPage";
import UsersManagementPage from "./pages/Admin/AdminUsersPage";

function App() {
  return (

    
    // Wrap the *entire app* in AuthProvider
    <AuthProvider>
      <div
        style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      >
        {/* Navbar is outside Routes, so it stays on every page */}
        <Navbar />

        {/* The main content area that changes */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: "var(--bg-secondary)",
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

                <Route path="/cache" element={<CacheManagementPage />} />
                <Route path="/marketlists" element={<MarketlistsManagementPage />} />
                <Route path="/users" element={<UsersManagementPage />} />
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
            <Route path="/list" element={<MarketList />} />
            <Route path="/monitoring" element={<MonitoringDashboard />} />

            {/* The "invisible" page LINE redirects to */}
            <Route path="/auth/callback" element={<LineCallback />} />
          </Routes>
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;
