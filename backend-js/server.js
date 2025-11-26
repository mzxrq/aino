const express = require("express");
const { connectDB } = require("./config/db");
const cors = require("cors");

require("dotenv").config();

const app = express();
app.use(cors());

// Middleware
app.use(express.json());

// Routes
const subscriberRoutes = require("./routes/subscriberRoutes");
app.use("/subscribers", subscriberRoutes);
// alias path used by frontend
app.use("/subscriptions", subscriberRoutes);

const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

const PORT = process.env.PORT || 5050;

app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

// Connect DB but start server regardless so file-based fallbacks work
connectDB()
  .then(() => console.log('Connected to DB'))
  .catch(err => console.warn('DB connection failed, continuing without DB:', err))
  .finally(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
