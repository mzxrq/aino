/**
 * Entry point for the Express server.
 * Loads environment variables, connects to MongoDB, and sets up routes & middleware.
 */

const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, '..', '..', '.env') });

const express = require("express");
const { createProxyMiddleware } = require('http-proxy-middleware');
const { connectDB } = require("./config/db");
const cors = require("cors");

const app = express();

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON requests
app.use(express.json());

/* =======================
   Proxy Middleware - Forward /py/* to Python backend at 5000
   ======================= */
app.use('/py', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  // Do not rewrite the path; Python mounts routers under "/py"
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.url}:`, err.message);
    res.status(503).json({ error: 'Python backend unavailable' });
  }
}));


/* =======================
   Route Definitions
   ======================= */

// Anomalies routes (CRUD operations)
const anomaliesRoutes = require("./routes/anomaliesRoute");
app.use("/node/anomalies", anomaliesRoutes);

// Anomaly memos (notes) - persisted memos for anomalies
// anomaly memos route removed (rolled back)

// Cache routes (chart data CRUD operations)
const cacheRoutes = require("./routes/cacheRoute");
app.use("/node/cache", cacheRoutes);
// Subscribers routes
const subscribersRoutes = require("./routes/subscribersRoute");
app.use("/node/subscribers", subscribersRoutes);
// Marketlists routes
const marketlistsRoutes = require('./routes/marketlistsRoute');
app.use('/node/marketlists', marketlistsRoutes);
  
// Users routes
const usersRoutes = require('./routes/usersRoutes');
app.use('/node/users', usersRoutes);

const mailRoutes = require('./routes/mailRoute');
app.use('/node/mail', mailRoutes);

// News proxy route (fetches from external news provider via backend)
const newsRoutes = require('./routes/newsRoutes');
app.use('/node/news', newsRoutes);

// Debug routes
const debugRoutes = require('./routes/debugRoutes');
app.use('/node/debug', debugRoutes);

// Admin routes (protected)
const adminRoutes = require('./routes/adminRoutes');
app.use('/node/admin', adminRoutes);

// Stock info routes (proxy to Python)
const stockInfoRoutes = require('./routes/stockInfoRoute');
app.use('/node/stock', stockInfoRoutes);

// Stock groups routes (save/load user stock preferences)
const stockGroupsRoutes = require('./routes/stockGroupsRoutes');
app.use('/node/stock-groups', stockGroupsRoutes);

// Seed routes
const seedRoutes = require('./routes/seedRoute');
app.use('/node/seed', seedRoutes);

// Search routes (ticker search API)
const searchRoutes = require('./routes/searchRoutes');
app.use('/node', searchRoutes);

// Price calculation routes
const priceRoutes = require('./routes/priceRoutes');
app.use('/node/price', priceRoutes);

// Bulk price calculation routes
const priceBulkRoutes = require('./routes/priceBulkRoutes');
app.use('/node/price', priceBulkRoutes);

// Favorites routes (user-specific favorite stocks)
const favoritesRoutes = require('./routes/favoritesRoute');
app.use('/node/favorites', favoritesRoutes);

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
   Database Connection & Server Start
   ======================= */

const PORT = process.env.PORT || 5050;

// Connect to MongoDB but start server regardless
connectDB()
  .then(() => {
    console.log('Connected to DB');
    startServer();
  })
  .catch(err => {
    console.warn('DB connection failed, continuing without DB:', err);
    startServer();
  });

/**
 * Starts the Express server on the specified PORT
 */
function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });

  // Listen for server errors
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
}

/* =======================
   Global Error Handlers
   ======================= */

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
