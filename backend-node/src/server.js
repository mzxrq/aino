const express = require("express");
const { connectDB } = require("./config/db");
const cors = require("cors");

require("dotenv").config();

const app = express();
app.use(cors());

// Middleware
app.use(express.json());
// Serve uploaded files
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// Routes

const subscriberRoutes = require("./routes/subscriberRoutes");
app.use("/subscribers", subscriberRoutes);
app.use("/subscriptions", subscriberRoutes);

const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

const dashboardRoute = require("./routes/dashboardRoute");
app.use("/dashboard", dashboardRoute);

const chartRoutes = require("./routes/chartRoutes");
app.use("/chart", chartRoutes);

const PORT = process.env.PORT || 5050;

app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

// Healthcheck endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Connect DB but start server regardless so file-based fallbacks work
connectDB()
  .then(() => {
    console.log('Connected to DB');
    startServer();
  })
  .catch(err => {
    console.warn('DB connection failed, continuing without DB:', err);
    startServer();
  });

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
