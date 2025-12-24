import React, { useState, useEffect } from 'react';
import Swal from '../utils/muiSwal';
import '../css/MonitoringDashboard.css';

const MonitoringDashboard = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    // Gateway + Python fallback
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
    const PY_DIRECT = import.meta.env.VITE_LINE_PY_URL || 'http://localhost:5000';
    const PY_BASE = `${API_URL}/py`;
    const fetchPyJson = async (path, init) => {
        try {
            const r = await fetch(`${PY_BASE}${path}`, init);
            if (r.ok) return await r.json();
        } catch (_) { /* fall back */ }
        const r2 = await fetch(`${PY_DIRECT}/py${path}`, init);
        if (!r2.ok) throw new Error(`status ${r2.status}`);
        return await r2.json();
    };

    const fetchStatus = async () => {
        try {
            const data = await fetchPyJson(`/monitoring/status`);
            setStatus(data);
            setLastUpdate(new Date());
            setLoading(false);
        } catch (error) {
            console.error('Error fetching monitoring status:', error);
            setLoading(false);
        }
    };

    const triggerScan = async (market = null) => {
        setScanning(true);
        try {
            const body = market ? { market } : {};
            const data = await fetchPyJson(`/monitoring/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            await Swal.fire({
              icon: 'success',
              title: 'Scan Complete',
              text: `${data.total_anomalies} anomalies detected in ${data.tickers_scanned} stocks`,
              confirmButtonColor: '#00aaff'
            });
            fetchStatus();
        } catch (error) {
            console.error('Error triggering scan:', error);
            await Swal.fire({
              icon: 'error',
              title: 'Scan Failed',
              text: error.message,
              confirmButtonColor: '#dc2626'
            });
        } finally {
            setScanning(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="monitoring-loading">Loading monitoring status...</div>;
    if (!status) return <div className="monitoring-error">Failed to load monitoring data</div>;

    const { monitored_stocks, scheduler_enabled, anomalies_last_24h, recent_detection_runs } = status;

    return (
        <div className="monitoring-dashboard">
            <div className="monitoring-header">
                <h1>Real-Time Stock Monitoring</h1>
                <div className="monitoring-status">
                    <span className={`status-badge ${scheduler_enabled ? 'active' : 'inactive'}`}>
                        Scheduler: {scheduler_enabled ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    {lastUpdate && (
                        <span className="last-update">
                            Last update: {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </div>

            <div className="monitoring-content">
                {/* Quick Actions Section */}
                <div className="quick-actions-section">
                    <h3>Quick Actions</h3>
                    <div className="action-buttons">
                        <button 
                            onClick={() => triggerScan()} 
                            disabled={scanning}
                            className="btn-primary"
                        >
                            <span className="btn-icon">▶️</span> {scanning ? 'Scanning...' : 'Scan All Markets'}
                        </button>
                        <button 
                            onClick={() => triggerScan('US')} 
                            disabled={scanning}
                            className="btn-secondary"
                        >
                            <span className="btn-icon">🇺🇸</span> Scan US ({monitored_stocks.US})
                        </button>
                        <button 
                            onClick={() => triggerScan('JP')} 
                            disabled={scanning}
                            className="btn-secondary"
                        >
                            <span className="btn-icon">🇯🇵</span> Scan Japan ({monitored_stocks.JP})
                        </button>
                        <button 
                            onClick={() => triggerScan('TH')} 
                            disabled={scanning}
                            className="btn-secondary"
                        >
                            <span className="btn-icon">🇹🇭</span> Scan Thailand ({monitored_stocks.TH})
                        </button>
                    </div>
                </div>

                {/* Status Overview */}
                <div className="status-overview">
                    <h3>System Status</h3>
                    <div className="status-row">
                        <div className="status-item">
                            <label>Total Stocks Monitored</label>
                            <div className="status-value">{monitored_stocks.Total}</div>
                        </div>
                        <div className="status-item">
                            <label>Recent Anomalies (24h)</label>
                            <div className="status-value anomaly-count">
                                {(anomalies_last_24h?.US || 0) + (anomalies_last_24h?.JP || 0) + (anomalies_last_24h?.TH || 0)}
                            </div>
                        </div>
                        <div className="status-item">
                            <label>System Status</label>
                            <div className="status-value status-active">🟢 Running</div>
                        </div>
                    </div>
                </div>

                {/* Anomaly Breakdown by Market */}
                <div className="anomaly-breakdown">
                    <h3>Anomalies by Market (Last 24h)</h3>
                    <div className="breakdown-row">
                        <div className="breakdown-item us-market">
                            <div className="market-label">US Market</div>
                            <div className="market-count">{anomalies_last_24h?.US || 0}</div>
                        </div>
                        <div className="breakdown-item jp-market">
                            <div className="market-label">Japan Market</div>
                            <div className="market-count">{anomalies_last_24h?.JP || 0}</div>
                        </div>
                        <div className="breakdown-item th-market">
                            <div className="market-label">Thailand Market</div>
                            <div className="market-count">{anomalies_last_24h?.TH || 0}</div>
                        </div>
                    </div>
                </div>

                {/* Testing & Utilities */}
                <div className="testing-section">
                    <h3>Testing & Utilities</h3>
                    <div className="testing-content">
                        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                            Use the button below to test the notification system. It will send alerts for any unsent anomalies found in the last 60 days.
                        </p>
                        <button 
                            onClick={async () => {
                                try {
                                    const data = await fetchPyJson(`/notifications/test`, { method: 'POST' });
                                    if (data.status === 'no_anomalies') {
                                        await Swal.fire({
                                          icon: 'info',
                                          title: 'No Anomalies',
                                          text: 'No unsent anomalies found in the last 60 days',
                                          confirmButtonColor: '#00aaff'
                                        });
                                    } else {
                                        const stats = data.notification_stats;
                                        await Swal.fire({
                                          icon: 'success',
                                          title: 'Notifications Sent!',
                                          html: `
                                            <div style="text-align: left;">
                                              <p><strong>Users notified:</strong> ${stats.notified_users}</p>
                                              <p><strong>LINE messages:</strong> ${stats.line_sent}</p>
                                              <p><strong>Emails:</strong> ${stats.email_sent}</p>
                                              <p><strong>Anomalies processed:</strong> ${data.anomalies_processed}</p>
                                            </div>
                                          `,
                                          confirmButtonColor: '#00aaff'
                                        });
                                    }
                                } catch (error) {
                                    await Swal.fire({
                                      icon: 'error',
                                      title: 'Error',
                                      text: 'Failed to send notifications: ' + error.message,
                                      confirmButtonColor: '#dc2626'
                                    });
                                }
                            }}
                            className="btn-test"
                            disabled={scanning}
                        >
                            🔔 Test Notification System
                        </button>
                    </div>
                </div>

                {/* Monitored Stocks Reference */}
                <div className="stocks-reference">
                    <h3>Monitored Stocks ({status.all_stocks?.length || 0})</h3>
                    <div className="stocks-list">
                        {status.all_stocks && status.all_stocks.map((ticker, idx) => {
                            const disp = (window.__MASTER_TICKERS__ && window.__MASTER_TICKERS__.rawToDisplay && window.__MASTER_TICKERS__.rawToDisplay[ticker]) ? window.__MASTER_TICKERS__.rawToDisplay[ticker] : (ticker ? ticker.split('.')[0] : ticker);
                            return (<span key={idx} className="stock-badge">{disp}</span>);
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MonitoringDashboard;
