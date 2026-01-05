/** marketlist.route.js
 *  ---------------------  
 *  Market list route definitions
 */



const express = require('express');
const router = express.Router();
const marketscontroller = require('./marketlist.controller');

// Debug: Log route access
// console.log('Handler check:', controller);

/** ======================
 *  Basic Routes
    ====================== */
router.post('/', marketscontroller.create);
router.post('/bulk', marketscontroller.bulkCreate);
router.get('/', marketscontroller.getAll);
router.get('/ticker/:ticker', marketscontroller.getByTicker);
router.get('/:id', marketscontroller.getById);
router.put('/:id', marketscontroller.update);
router.delete('/:id', marketscontroller.remove);

module.exports = router;
