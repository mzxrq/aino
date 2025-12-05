/**
 * subscriberRoutes.js
 * ------------------
 * Handles routes related to subscriber management.
 *
 * Routes:
 *  - GET /             : Fetch all subscribers (optional authentication)
 *  - GET /me           : Fetch subscriptions for the logged-in user (requires auth)
 *  - GET /:id          : Fetch one subscriber by ID
 *  - POST /status      : Check subscription status for a user and ticker
 *  - POST /            : Add or update a subscriber's tickers
 *  - DELETE /          : Remove tickers from a subscriber
 */

const express = require("express");
const router = express.Router();
const controller = require("../controllers/subscriberController");
const { optionalAuthenticate, requireAuth } = require('../middleware/authMiddleware');

// Routes
router.get("/", optionalAuthenticate, controller.getAll);          // Get all subscribers
router.get("/me", requireAuth, controller.getMySubscriptions);    // Get subscriptions for logged-in user
router.get("/:id", controller.getOne);                             // Get a single subscriber by ID
router.post("/status", controller.status);                         // Check subscription status
router.post("/", controller.addOrUpdate);                          // Add or update subscriber
router.delete("/", controller.removeTickers);                      // Remove tickers from a subscriber

module.exports = router;
