const express = require("express");
const router = express.Router();
const connectDB = require("./connect");

router.get("/users", async (req, res) => {
    const db = connectDB.getDb();
    if (!db) {
        return res.status(500).json({ error: "Database not connected" });
    }

    try {
        const users = await db.collection("users").find({}).toArray();
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

module.exports = router;