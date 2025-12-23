<div align="center">
  <img src="https://snx.s-ul.eu/tmNmIQd0" alt="Stock Dashboard" width="280" />
  <h1>Stock Market Anomaly Detection Dashboard</h1>
  <p>A comprehensive full-stack application for real-time stock market monitoring, anomaly detection, and automated notifications.</p>
  <p>
    <a href="https://react.dev/">React</a> ·
    <a href="https://nodejs.org/">Node.js</a> ·
    <a href="https://fastapi.tiangolo.com/">FastAPI</a> ·
    <a href="https://www.mongodb.com/">MongoDB</a>
  </p>
</div>

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)


## 🏗️ Architecture

```
┌─────────────────┐
│  Frontend       │
│  React + Vite   │  Port 5173
│  (ECharts)      │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Node Gateway   │  Port 5050 (Public)
│  Express.js     │  - Routes: /node/*
│  MongoDB ⟷ JSON │  - Proxy: /py/* → Python
└────────┬────────┘
         │ Proxy
         ▼
┌─────────────────┐
│  Python API     │  Port 5000 (Internal)
│  FastAPI        │  - Routes: /py/*
│  yfinance       │  - ML Models
│  IsolationForest│  - Scheduler
└────────┬────────┘
         │
         ▼
    ┌─────────┐
    │ MongoDB │  Port 27017
    └─────────┘
```
