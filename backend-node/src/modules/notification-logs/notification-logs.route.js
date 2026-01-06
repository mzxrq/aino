const express = require('express');
const router = express.Router();
const Controller = require('./notification-logs.controller');
const { requireAuth, authorize } = require('../../middleware/authMiddleware');

router.get('/', authorize(['admin']), Controller.getAll);
router.delete('/all', authorize(['admin']), Controller.deleteAll);
router.delete('/:id', authorize(['admin']), Controller.deleteLog);

module.exports = router;
