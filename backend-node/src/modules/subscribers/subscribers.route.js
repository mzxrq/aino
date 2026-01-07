/**
 * subscribersRoute.js
 * -------------------
 * Express routes for subscribers operations
 */

const express = require('express');
const router = express.Router();
const subscribersController = require('./subscribers.controller');
const { requireAuth, authorize } = require('../../middleware/authMiddleware');

// Create or update subscriber (add tickers)
router.post('/',requireAuth, subscribersController.addOrUpdate);

// Remove tickers from subscriber
router.post('/tickers/remove',requireAuth, subscribersController.removeTickers);

// Check subscription status
router.post('/status', requireAuth, subscribersController.status);

// Get current user's subscriptions
router.get('/me',requireAuth, subscribersController.getMySubscriptions);

// CRUD
router.get('/', authorize(['admin']), subscribersController.getAll);
router.get('/:id', authorize(['admin']), subscribersController.getOne);
router.delete('/:id', authorize(['admin']), subscribersController.deleteById);

module.exports = router;
