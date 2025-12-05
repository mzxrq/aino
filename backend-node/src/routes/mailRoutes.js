const express = require("express");
const router = express.Router();
const mailController = require("../controllers/mailController");

// POST /mail/send -> send an email
router.post("/send", mailController.sendMail);

module.exports = router;
