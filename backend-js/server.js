const express = require("express");
const { connectDB } = require("./config/db");
const subscriberRoutes = require("./routes/subscriberRoutes");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Routes
app.use("/subscribe", subscriberRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to the Home Page!");
});

// Connect DB and start server
connectDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => console.error("DB connection failed", err));
