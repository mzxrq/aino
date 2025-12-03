const express = require("express");
const router = express.Router();
const controller = require("../controllers/subscriberController");
const { optionalAuthenticate, requireAuth } = require('../middleware/authMiddleware');

// Routes
router.get("/", optionalAuthenticate, controller.getAll);
router.get("/me", requireAuth, controller.getMySubscriptions);
router.get("/:id", controller.getOne);
router.post("/status", controller.status);
router.post("/", controller.addOrUpdate);
router.delete("/", controller.removeTickers);


module.exports = router;
