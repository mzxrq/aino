/**
 * stockInfoController.js
 * ----------------------
 * Proxies stock info requests to Python backend
 */

const axios = require('axios');

const getStockInfo = async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) {
      return res.status(400).json({ success: false, error: 'ticker query param required' });
    }

    const pythonUrl = `http://localhost:8000/py/stock/info?ticker=${encodeURIComponent(ticker)}`;
    const response = await axios.get(pythonUrl);
    
    res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    console.error('getStockInfo err', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getStockInfo };
