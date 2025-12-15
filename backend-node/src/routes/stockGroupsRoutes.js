const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getAllStockGroups,
  createStockGroup,
  updateStockGroup,
  deleteStockGroup
} = require('../controllers/stockGroupsController');

const router = express.Router();

// Get all stock groups for authenticated user
router.get('/', requireAuth, getAllStockGroups);

// Create new stock group
router.post('/', requireAuth, createStockGroup);

// Update existing stock group
router.put('/:groupId', requireAuth, updateStockGroup);

// Delete stock group
router.delete('/:groupId', requireAuth, deleteStockGroup);

module.exports = router;
