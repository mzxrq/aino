import React from 'react';
import '../css/Footer.css';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      {/* <div className="footer-content">
        <div className="footer-section">
          <h4>Aino</h4>
          <p>Real-time market monitoring with anomaly detection and LINE notifications.</p>
          <div className="footer-links">
            <a href="#about">About</a>
            <span className="divider">•</span>
            <a href="#privacy">Privacy</a>
            <span className="divider">•</span>
            <a href="#terms">Terms</a>
          </div>
        </div>

        <div className="footer-section">
          <h4>Features</h4>
          <ul>
            <li><a href="#anomaly">Anomaly Detection</a></li>
            <li><a href="#alerts">Real-time Alerts</a></li>
            <li><a href="#charts">Interactive Charts</a></li>
            <li><a href="#notifications">LINE Notifications</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Resources</h4>
          <ul>
            <li><a href="#docs">Documentation</a></li>
            <li><a href="#api">API Reference</a></li>
            <li><a href="#contact">Contact Support</a></li>
            <li><a href="#status">System Status</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Connect</h4>
          <div className="social-links">
            <a href="#twitter" title="Twitter" className="social-link">𝕏</a>
            <a href="#github" title="GitHub" className="social-link">GitHub</a>
            <a href="#email" title="Email" className="social-link">Email</a>
          </div>
        </div>
      </div> */}

      <div className="footer-bottom">
        <div className="footer-bottom-content">
          <p>&copy; {currentYear} Aino. Real-time market monitoring with anomaly detection and LINE notifications.</p>
          <p className="footer-note">yfinance, Apache ECharts.</p>
        </div>
      </div>
    </footer>
  );
}
