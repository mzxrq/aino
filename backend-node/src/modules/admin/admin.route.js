const express = require('express');
const router = express.Router();
const Controller = require('./admin.controller');
const { authorize } = require('../../middleware/authMiddleware');

// DELETE /node/admin/delete_all?collection=users
router.delete('/delete_all', authorize(['admin']), Controller.deleteAll);

module.exports = router;
