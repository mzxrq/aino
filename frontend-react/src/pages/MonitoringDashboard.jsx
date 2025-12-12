import React, { useState, useEffect } from 'react';
import '../css/MonitoringDashboard.css';

const MonitoringDashboard = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    // Python backend on port 5000
    const PYTHON_API_URL = 'http://localhost:5000';

    const fetchStatus = async () => {
        try {
            const response = await fetch(`${PYTHON_API_URL}/py/monitoring/status`);
            const data = await response.json();
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
            const response = await fetch(`${PYTHON_API_URL}/py/monitoring/run`, {
                method: 'POST',
            headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            alert(`Scan complete: ${data.total_anomalies} anomalies detected in ${data.tickers_scanned} stocks`);
            fetchStatus(); // Refresh stats
        } catch (error) {
            console.error('Error triggering scan:', error);
            alert('Scan failed: ' + error.message);
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
                                    const response = await fetch(`${PYTHON_API_URL}/py/notifications/test`, {
                                        method: 'POST'
                                    });
                                    const data = await response.json();
                                    if (data.status === 'no_anomalies') {
                                        alert('No unsent anomalies found in the last 60 days');
                                    } else {
                                        const stats = data.notification_stats;
                                        alert(
                                            `✅ Notifications sent!\n\n` +
                                            `Users notified: ${stats.notified_users}\n` +
                                            `LINE messages: ${stats.line_sent}\n` +
                                            `Emails: ${stats.email_sent}\n` +
                                            `Anomalies processed: ${data.anomalies_processed}`
                                        );
                                    }
                                } catch (error) {
                                    alert('Failed to send notifications: ' + error.message);
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
                        {status.all_stocks && status.all_stocks.map((ticker, idx) => (
                            <span key={idx} className="stock-badge">{ticker}</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MonitoringDashboard;
