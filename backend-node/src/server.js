/**
 * Entry point for the Express server.
 * Loads environment variables, connects to MongoDB, and sets up routes & middleware.
 */

const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, '..', '..', '.env') });

const express = require("express");
const { connectDB } = require("./config/db");
const cors = require("cors");

const app = express();

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON requests
app.use(express.json());


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

// Stock info routes (proxy to Python)
const stockInfoRoutes = require('./routes/stockInfoRoute');
app.use('/node/stock', stockInfoRoutes);

// Seed routes
const seedRoutes = require('./routes/seedRoute');
app.use('/node/seed', seedRoutes);

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
