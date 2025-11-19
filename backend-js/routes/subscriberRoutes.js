const express = require("express");
const router = express.Router();
const controller = require("../controllers/subscriberController");

// Routes
router.get("/", controller.getAll);
router.get("/:lineID", controller.getOne);
router.post("/", controller.addOrUpdate);
router.delete("/", controller.removeTickers);

module.exports = router;
