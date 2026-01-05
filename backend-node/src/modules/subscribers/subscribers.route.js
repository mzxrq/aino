/**
 * subscribersRoute.js
 * -------------------
 * Express routes for subscribers operations
 */

const express = require('express');
const router = express.Router();
const subscribersController = require('./subscribers.controller');
const { requireAuth} = require('../../middleware/authMiddleware');

// Create or update subscriber (add tickers)
router.post('/', subscribersController.addOrUpdate);

// Remove tickers from subscriber
router.post('/tickers/remove', subscribersController.removeTickers);

// Check subscription status
router.post('/status', subscribersController.status);

// Get current user's subscriptions
router.get('/me',requireAuth, subscribersController.getMySubscriptions);

// CRUD
router.get('/', subscribersController.getAll);
router.get('/:id', subscribersController.getOne);
router.delete('/:id', subscribersController.deleteById);

module.exports = router;
