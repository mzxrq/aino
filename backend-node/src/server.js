/** server.js
 * Entry point for the Express server.
 * Loads environment variables, connects to MongoDB, and sets up routes & middleware.
 */
const express = require('express');
const { static: serveStatic } = express;
const { resolve, join } = require('path');
const { config } = require('dotenv');
const { connectDB } = require('./config/db');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Load environment variables from .env file
// Primary: backend-node/.env (for service-local settings). Fallback: project root .env.
const primaryEnv = resolve(__dirname, '../.env');
const fallbackEnv = resolve(__dirname, '../../.env');
config({ path: primaryEnv });
if (!process.env.JWT_SECRET_KEY) {
  // Attempt to load root-level .env when service-local file is missing
  console.warn(`JWT_SECRET_KEY not found in ${primaryEnv}, loading fallback ${fallbackEnv}`);
  config({ path: fallbackEnv });
}

const app = express();
const PORT = process.env.PORT || 5050;

/* =======================
   Middleware Setup
   ======================= */
app.use(express.json());

// Enable CORS for all routes
app.use(cors());

// Activity logger: record non-GET CRUD operations to activity logs
const activityLogger = require('./middleware/activityLogger');
app.use(activityLogger);

/* =======================
   Proxy Middleware - Forward /py/* to Python backend at 5000
   ======================= */
app.use('/py', createProxyMiddleware({
  target: 'https://didactic-chainsaw-qrvv7p7vpxqf45wr-5000.app.github.dev/',
  changeOrigin: true,
  // Do not rewrite the path; Python mounts routers under "/py"
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.url}:`, err.message);
    res.status(503).json({ error: 'Python backend unavailable' });
  }
}));

/* =======================
   Static File Serving
   ======================= */
app.use('/uploads', serveStatic(join(__dirname, 'uploads')));

/* =======================
   Route Definitions
   ======================= */

// 1. Activity logs route (for admin dashboard recent activity)
const activityLogsRoutes = require('./modules/activity-log/activity-log.route');
app.use('/node/logs', activityLogsRoutes);

// 2. User route (for authentication, registration, profile)
const usersRoutes = require('./modules/user/user.route');
app.use('/node/users', usersRoutes);

// 3. Mail route (for sending emails)
const mailRoutes = require('./modules/nodemailer/nodemailer.route');
app.use('/node/mail', mailRoutes);

// 4. Anomalies route (CRUD operations for anomalies)
const anomaliesRoutes = require('./modules/anomaly/anomaly.route');
app.use('/node/anomalies', anomaliesRoutes);

// Cache routes (chart data CRUD operations)
const cacheRoutes = require('./modules/cache/cache.route');
app.use('/node/cache', cacheRoutes);

// Subscribers routes
const subscribersRoutes = require('./modules/subscribers/subscribers.route');
app.use('/node/subscribers', subscribersRoutes);

// Stock list routes (stockList collection). Keep legacy /marketlists alias for compatibility.
const marketlistsRoutes = require('./modules/stockList/stocklist.route');
app.use('/node/stock-list', marketlistsRoutes);
app.use('/node/marketlists', marketlistsRoutes);

// Search route (simple fuzzy search over stockList)
const searchRoutes = require('./modules/search/search.route');
app.use('/node/search', searchRoutes);

// Stock info routes (proxy to Python)
const stockInfoRoutes = require('./modules/stock-info/stock-info.route');
app.use('/node/stock', stockInfoRoutes);

// Stock groups routes (save/load user stock preferences)
const stockGroupsRoutes = require('./modules/stock-groups/stock-groups.route');
app.use('/node/stock-groups', stockGroupsRoutes);

// Seed routes
const seedRoutes = require('./modules/seed/seed.route');
app.use('/node/seed', seedRoutes);

// Favorites routes
const favoriteRoutes = require('./modules/favorite/favorite.route');
app.use('/node/favorites', favoriteRoutes);

// Python-integrate routes
const pythonIntegrateRoutes = require('./modules/python-integrate/python-integrate.route');
app.use('/node/python-integrate', pythonIntegrateRoutes);

// Notification logs (created to expose Python notification logs to admin)
const notificationLogsRoutes = require('./modules/notification-logs/notification-logs.route');
app.use('/node/notification_logs', notificationLogsRoutes);

// Admin utility routes (delete-all etc.)
const adminRoutes = require('./modules/admin/admin.route');
app.use('/node/admin', adminRoutes);

// news routes (proxy to NewsAPI)
const newsRoutes = require('./modules/news/news.route');
app.use('/node/news', newsRoutes);

// price

const priceRoutes = require('./modules/price/priceRoutes');
app.use('/node/price', priceRoutes);



/* =======================
   Basic Routes / Healthchecks
   ======================= */

// Home route
app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

// Healthcheck route for monitoring
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* =======================
   Start Server & Connect to DB
   ======================= */
// Attempt to connect to the database, but do NOT exit the process if DB is unavailable.
// This allows the service to continue in file-cache fallback mode for development.
(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT} with DB connected`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB, starting server without DB (using file fallback):', err && err.message ? err.message : err);
    app.listen(PORT, () => {
      console.log(`Server running in fallback mode on port ${PORT} (no DB)`);
    });
  }
})();


/**
 * Starts the Express server on the specified PORT
 */
// function startServer() {
//   const server = app.listen(PORT, () => {
//     console.log(`Server is listening on port ${PORT}`);
//   });

//   // Listen for server errors
//   server.on('error', (err) => {
//     console.error('Server error:', err);
//   });
// }

/* =======================
   Global Error Handlers
   ======================= */

// // Handle uncaught exceptions
// process.on('uncaughtException', (err) => {
//   console.error('Uncaught Exception:', err);
// });

// // Handle unhandled promise rejections
// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
// });
