/**
 * marketlistsRoute.js
 * -------------------
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/marketlistsController');

router.post('/', controller.create);
router.post('/bulk', controller.bulkCreate);
router.get('/', controller.getAll);
router.get('/ticker/:ticker', controller.getByTicker);
router.get('/:id', controller.getById);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
