// src/pages/Home.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

export default function Home() {
  return (
    <div className="home-container">

      {/* --- Hero Section --- */}
      <section className="hero-section">

        <div className="hero-content">
          <h1 className="hero-title">
            Securities Trading <br />
            <span>Anomalies</span> Detection
          </h1>
          <p className="hero-subtitle">
            Harness the power of Unsupervised AI to identify unusual trading patterns across multiple stock markets.
          </p>
          <div className="hero-buttons" style={{ display: 'flex', gap: '8px' }}>
            <Link to="/chart" className="btn btn-primary">View Demo Chart</Link>
            <Link to="/login" className="btn btn-line">Login with LINE</Link>
          </div>
        </div>

        {/* Right: Visual/Image */}
        <div className="hero-image-container">
          <div className="hero-placeholder">
            {/* Simple CSS Graphic representing a chart */}
            <div className="hero-chart-graphic">
              <div className="bar" style={{ height: '40%' }}></div>
              <div className="bar" style={{ height: '60%' }}></div>
              <div className="bar" style={{ height: '45%' }}></div>
              <div className="bar active" style={{ height: '80%' }}></div>
              <div className="bar" style={{ height: '55%' }}></div>
              <div className="bar alert" style={{ height: '80%' }}></div> {/* The Anomaly */}
              <div className="bar" style={{ height: '30%' }}></div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Features Grid --- */}
      {/* <section className="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3 className="feature-title">Multi-Market Support</h3>
            <p className="feature-desc">
              Seamlessly track stocks across NASDAQ, NYSE, Tokyo Stock Exchange (TSE), and the Stock Exchange of Thailand (SET).
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3 className="feature-title">Unsupervised AI</h3>
            <p className="feature-desc">
              Powered by Isolation Forest algorithms to detect multidimensional anomalies in Price, Volume, and Volatility.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3 className="feature-title">LINE Notifications</h3>
            <p className="feature-desc">
              Never miss a beat. Receive push notifications directly to your LINE app whenever a subscribed stock triggers an alert.
            </p>
          </div>
        </div>
      </section> */}

    </div>
  );
}