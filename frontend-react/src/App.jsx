import React, { useEffect, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

// 1. Import Auth Provider
import { AuthProvider } from "./context/AuthContext";

// 2. Import Components
import Navbar from "./components/Navbar";

// 3. Import Pages (lazy-loaded where heavy)
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Chart = lazy(() => import("./pages/Chart"));
const LargeChart = lazy(() => import("./pages/MainChart"));
const LineCallback = lazy(() => import("./pages/LineCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const StockList = lazy(() => import("./pages/StockList"));

import AdminRoute from "./pages/Admin/AdminRouteGuard";
const AdminLayout = lazy(() => import("../src/layouts/AdminLayout"));
const AnomaliesManagementPage = lazy(() => import("./pages/Admin/AdminAnomaliesPage"));
const CacheManagementPage = lazy(() => import("./pages/Admin/AdminCachePage"));
const AdminStockList = lazy(() => import("./pages/Admin/AdminStockListPage"));
const UsersManagementPage = lazy(() => import("./pages/Admin/AdminUsersPage"));
const SubscribersManagementPage = lazy(() => import("./pages/Admin/AdminSubscribersPage"));
const AdminDashboardPage = lazy(() => import("./pages/Admin/AdminDashboardPage"));
const AdminActivityLogsPage = lazy(() => import('./pages/Admin/AdminActivityLogsPage'));
const AdminNotificationLogsPage = lazy(() => import('./pages/Admin/AdminNotificationLogsPage'));
const AdminNodemailerLogsPage = lazy(() => import('./pages/Admin/AdminNodemailerLogsPage'));
const AdminJobsPage = lazy(() => import('./pages/Admin/AdminJobsPage'));
import ForgotPassword from './pages/ForgotPassword';

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
      } catch {
        /* swallow */
      }
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
          <Suspense fallback={<div className="route-fallback" style={{padding:20, textAlign:'center'}}>Loading…</div>}>
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
                <Route path="/activity-logs" element={<AdminActivityLogsPage />} />
                <Route path="/notification-logs" element={<AdminNotificationLogsPage />} />
                <Route path="/nodemailer-logs" element={<AdminNodemailerLogsPage />} />
                <Route path="/jobs" element={<AdminJobsPage />} />
                <Route path="/stocklist" element={<AdminStockList />} />
                <Route path="/users" element={<UsersManagementPage />} />
                <Route path="/subscribers" element={<SubscribersManagementPage />} />
              </Route>
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/register" element={<Register />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/chart/u/:ticker" element={<LargeChart />} />
            <Route path="/chart/u" element={<LargeChart />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/company/:ticker" element={<CompanyProfile />} />
            <Route path="/list" element={<StockList />} />

            {/* The "invisible" page LINE redirects to */}
            <Route path="/auth/callback" element={<LineCallback />} />
            </Routes>
          </Suspense>
          </div>
          </div>
        </div>
    </AuthProvider>
  );
}

export default App;
