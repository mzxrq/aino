// src/pages/Home.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../css/Home.css';
import logoSvg from '../assets/aino.svg';
import Footer from '../components/Footer';

const SAMPLE_ANOMALIES = [
  { id: '1', ticker: 'TICK', company: 'CompanyName', price: 3768, change: -2.3, anomalies: 1 },
  { id: '2', ticker: 'ABCD', company: 'Another Co', price: 3785, change: 1.2, anomalies: 2 },
  { id: '3', ticker: 'XYZA', company: 'Xyza Ltd', price: 2585, change: 0.8, anomalies: 1 },
  { id: '4', ticker: 'LMNO', company: 'Lmno Plc', price: 1968, change: -0.6, anomalies: 3 }
];

const SAMPLE_NEWS = [
  { id: 1, title: 'Market tumbles as tech stocks correct sharply', source: 'Daily Finance' },
  { id: 2, title: 'Oil prices push energy sector higher', source: 'Global News' },
  { id: 3, title: 'Central bank signals rate pause', source: 'MarketWatch' }
];

export default function Home() {
  const navigate = useNavigate();
  const [anomalies, setAnomalies] = useState([]);
  const [news, setNews] = useState([]);
  const API_URL = import.meta.env.VITE_API_URL;
  const PY_URL = import.meta.env.VITE_LINE_PY_URL;

  // Fetch anomalies from cache
  useEffect(() => {
    let isMounted = true;
    const fetchAnomalies = async () => {
      try {
        const res = await fetch(`${API_URL}/node/cache?type=anomalies&limit=4`);
        if (!res.ok) throw new Error('Failed to fetch anomalies');
        const data = await res.json();
        const mapped = (data?.data || []).map((d, idx) => ({
          id: `${d.ticker}-${idx}`,
          ticker: d.ticker,
          company: d.companyName || d.name || d.ticker,
          price: typeof d.price === 'number' ? d.price : 0,
          change: typeof d.change === 'number' ? d.change : 0,
          anomalies: d.anomalyCount || 1,
        }));
        if (isMounted && mapped.length > 0) setAnomalies(mapped);
        else if (isMounted) setAnomalies(SAMPLE_ANOMALIES);
      } catch (e) {
        console.debug('Anomaly fetch error, using sample:', e);
        if (isMounted) setAnomalies(SAMPLE_ANOMALIES);
      }
    };
    fetchAnomalies();
    return () => { isMounted = false; };
  }, [API_URL]);

  // Fetch news from yfinance
  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
      try {
        // Get top ticker from anomalies to fetch news for
        const ticker = anomalies?.[0]?.ticker || 'AAPL';
        const res = await fetch(`${PY_URL}/py/financials?ticker=${ticker}`);
        if (!res.ok) throw new Error('Failed to fetch news');
        const data = await res.json();
        const newsData = (data?.news || []).slice(0, 3).map((n, idx) => ({
          id: idx,
          title: n.title || n.headline || 'Market Update',
          source: n.source || n.publisher || 'Financial News',
          link: n.link || '#'
        }));
        if (isMounted && newsData.length > 0) setNews(newsData);
        else if (isMounted) setNews(SAMPLE_NEWS);
      } catch (e) {
        console.debug('News fetch error, using sample:', e);
        if (isMounted) setNews(SAMPLE_NEWS);
      }
    };
    if (anomalies.length > 0) {
      fetchNews();
    }
    return () => { isMounted = false; };
  }, [anomalies, PY_URL]);

  const handleDemoChart = () => {
    const first = (anomalies && anomalies.length > 0) ? anomalies[0] : SAMPLE_ANOMALIES[0];
    navigate('/chart', { state: { ticker: first.ticker } });
  };

  const handleLogin = () => {
    navigate('/login');
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleDemoChart();
      }
    };
    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [anomalies]);

  return (
    <div className="home-container">
      {/* Hero Section - Appears First */}
      <section className="hero-section-full">
        <div className="hero-content-centered">
          <img src={logoSvg} alt="Stock Dashboard Website Logo" className="hero-logo website-logo" />
          <p className="hero-motto">Stock Trading Anomaly Detector</p>
          <p className="hero-subtitle">Real-time market monitoring with alerts and easy subscription via LINE.</p>
          <div className="hero-buttons">
            <button className="btn btn-primary" onClick={handleDemoChart}>View Demo Chart</button>
            <button className="btn btn-line" onClick={handleLogin}>Login with LINE</button>
          </div>
        </div>
      </section>

      {/* Anomalies and News Grid */}
      <div className="homepage-grid">
        <div className="left-column">
          <div className="card anomaly-card">
            <div className="card-header">
              <h3>Recent anomaly found</h3>
              <Link to="#" className="show-more">Show more ›</Link>
            </div>
            <div className="card-body">
              {(anomalies.length ? anomalies : SAMPLE_ANOMALIES).map(a => (
                <div key={a.id} className="anomaly-row" onClick={() => navigate('/chart', { state: { ticker: a.ticker } })} style={{cursor: 'pointer'}}>
                  <div className="logo-circle" title={a.company}></div>
                  <div className="anomaly-meta">
                    <div className="ticker">{a.ticker}</div>
                    <div className="company">{a.company}</div>
                  </div>
                  <div className="anomaly-stats">
                    <div className={`price ${a.change < 0 ? 'down' : 'up'}`}>
                      {a.change < 0 ? '↓' : '↑'} {Number(a.price || 0).toLocaleString()} <span className="percent">{a.change > 0 ? '+' : ''}{a.change}%</span>
                    </div>
                    <div className="anomaly-count">
                      <span className="count-number">{a.anomalies}</span>
                      <span className="count-text">Found {a.anomalies} anml</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card anomaly-card">
            <div className="card-header">
              <h3>Previous sig. anomaly found</h3>
              <Link to="#" className="show-more">Show more ›</Link>
            </div>
            <div className="card-body">
              {(anomalies.length ? anomalies : SAMPLE_ANOMALIES).map(a => (
                <div key={a.id} className="anomaly-row" onClick={() => navigate('/chart', { state: { ticker: a.ticker } })} style={{cursor: 'pointer'}}>
                  <div className="logo-circle" title={a.company}></div>
                  <div className="anomaly-meta">
                    <div className="ticker">{a.ticker}</div>
                    <div className="company">{a.company}</div>
                  </div>
                  <div className="anomaly-stats">
                    <div className={`price ${a.change < 0 ? 'down' : 'up'}`}>
                      {a.change < 0 ? '↓' : '↑'} {Number(a.price || 0).toLocaleString()} <span className="percent">{a.change > 0 ? '+' : ''}{a.change}%</span>
                    </div>
                    <div className="anomaly-count">
                      <span className="count-number">{a.anomalies}</span>
                      <span className="count-text">Found {a.anomalies} anml</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="news-card card">
            <h4>Top News</h4>
            <ul className="news-list">
              {(news.length ? news : SAMPLE_NEWS).map(n => (
                <li key={n.id} className="news-item">
                  <div className="news-title">{n.title}</div>
                  <div className="news-source">{n.source}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}