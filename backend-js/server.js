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

const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

// Connect DB and start server
connectDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => console.error("DB connection failed", err));
