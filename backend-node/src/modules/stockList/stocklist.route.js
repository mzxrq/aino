/** marketlist.route.js
 *  ---------------------  
 *  Market list route definitions
 */



const express = require('express');
const router = express.Router();
const marketscontroller = require('./stocklist.controller');
const { requireAuth, authorize } = require('../../middleware/authMiddleware');

// Debug: Log route access
// console.log('Handler check:', controller);

/** ======================
 *  Basic Routes
    ====================== */
router.post('/', authorize(['admin']), marketscontroller.create);
router.post('/bulk', authorize(['admin']), marketscontroller.bulkCreate);
router.get('/', marketscontroller.getAll);
router.get('/ticker/:ticker', marketscontroller.getByTicker);
router.get('/:id', authorize(['admin']), marketscontroller.getById);
router.put('/:id', authorize(['admin']), marketscontroller.update);
router.delete('/:id', authorize(['admin']), marketscontroller.remove);

module.exports = router;
