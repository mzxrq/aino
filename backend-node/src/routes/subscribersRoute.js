/**
 * subscribersRoute.js
 * -------------------
 * Express routes for subscribers operations
 */

const express = require('express');
const router = express.Router();
const subscribersController = require('../controllers/subscribersController');
const { requireAuth, optionalAuthenticate } = require('../middleware/authMiddleware');

// Create or update subscriber (add tickers)
router.post('/', subscribersController.addOrUpdate);

// Remove tickers from subscriber
router.post('/tickers/remove', subscribersController.removeTickers);

// Check subscription status
router.post('/status', subscribersController.status);

// Get current user's subscriptions
router.get('/me',optionalAuthenticate, subscribersController.getMySubscriptions);

// CRUD
router.get('/', subscribersController.getAll);
router.get('/:id', subscribersController.getOne);
router.delete('/:id', subscribersController.deleteById);

module.exports = router;
