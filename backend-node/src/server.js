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

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =======================
   Route Definitions
   ======================= */

// Subscriber routes
const subscriberRoutes = require("./routes/subscriberRoutes");
app.use("/subscribers", subscriberRoutes);
app.use("/subscriptions", subscriberRoutes); // Alias for /subscribers

// Authentication routes
const authRoutes = require("./routes/userRoutes.js");
app.use("/auth", authRoutes);

// Dashboard routes
const dashboardRoute = require("./routes/marketListRoute.js");
app.use("/overview", dashboardRoute);

// Mail routes
const mailRoutes = require("./routes/mailRoutes.js");
app.use("/mail", mailRoutes);

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
