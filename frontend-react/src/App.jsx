import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// 1. Import Auth Provider
import { AuthProvider } from './context/AuthContext';

// 2. Import Components
import Navbar from './components/Navbar';

// 3. Import Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Chart from './pages/Chart';
import LargeChart from './pages/LargeChart';
import LineCallback from './pages/LineCallback';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile'; // <-- IMPORT NEW PAGE
import MarketList from './pages/MarketList';

function App() {
  return (
    // Wrap the *entire app* in AuthProvider
    <AuthProvider> 
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Navbar is outside Routes, so it stays on every page */}
        <Navbar />

        {/* The main content area that changes */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-secondary)' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/chart/u/:ticker" element={<LargeChart />} />
            <Route path="/chart/u" element={<LargeChart />} />
            {/* Backward compatibility for old superchart links */}
            <Route path="/superchart/:ticker" element={<LargeChart />} />
            <Route path="/superchart" element={<LargeChart />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} /> {/* <-- ADD NEW ROUTE */}
            <Route path="/list" element={<MarketList />} />
            
            {/* The "invisible" page LINE redirects to */}
            <Route path="/auth/callback" element={<LineCallback />} />
            
            {/* Catch-all: Redirect unknown URLs to Home */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
        
      </div>
    </AuthProvider>
  );
}

export default App;