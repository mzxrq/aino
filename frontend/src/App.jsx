import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// 1. Import Auth Provider
import { AuthProvider } from './context/AuthContext';

// 2. Import Components
import Navbar from './components/Navbar';

// 3. Import Pages
import Home from './pages/Home';
import Login from './pages/Login';
import AnomalyChart from './pages/AnomalyChart';
import LineCallback from './pages/LineCallback';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile'; // <-- IMPORT NEW PAGE

function App() {
  return (
    // Wrap the *entire app* in AuthProvider
    <AuthProvider> 
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Navbar is outside Routes, so it stays on every page */}
        <Navbar />

        {/* The main content area that changes */}
        <div style={{ flex: 1, overflow: 'auto', background: '#F5F7F9' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/chart" element={<AnomalyChart />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} /> {/* <-- ADD NEW ROUTE */}
            
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