const express = require("express");
const router = express.Router();
const controller = require("../controllers/subscriberController");
const { optionalAuthenticate, requireAuth } = require('../middleware/authMiddleware');

// Routes
router.get("/", optionalAuthenticate, controller.getAll);
router.get("/me", requireAuth, controller.getMySubscriptions);
router.get("/:lineID", controller.getOne);
router.post("/", controller.addOrUpdate);
router.delete("/", controller.removeTickers);
// allow deleting by id (used by frontend)
router.delete("/:id", requireAuth, controller.deleteById);

module.exports = router;
