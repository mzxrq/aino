/** search.route.js
 * Simple search endpoint for market tickers and company names
 */
const express = require('express');
const router = express.Router();
const MarketListModel = require('../stockList/stocklist.model');

// GET /node/search?q=apple&page=1&pageSize=25
router.get('/', async (req, res) => {
  try {
    const q = req.query.q || req.query.query || '';
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 25;

    // Calculate skip based on page number (0-indexed)
    const skip = Math.max(0, (page - 1) * pageSize);
    
    // Fetch ONE extra item to detect if there are more pages
    const opts = { 
      query: q, 
      limit: pageSize + 1,  // Fetch one extra to know if there's a next page
      skip: skip,
      sortBy: 'ticker',     // Always sort by ticker for consistent ordering
      sortOrder: 'asc'
    };
    
    console.log(`Search query: "${q}", page: ${page}, pageSize: ${pageSize}, skip: ${skip}`);
    
    const result = await MarketListModel.getAll(opts);
    const allItems = Array.isArray(result.items) ? result.items : [];
    const totalCount = result.total || 0;  // Total matching results (regardless of pagination)
    
    // Check if there are more pages
    const hasMore = allItems.length > pageSize;
    
    // Only return pageSize items (not the extra one)
    const paginatedItems = allItems.slice(0, pageSize);

    // Normalize to a lightweight search result shape expected by frontend
    const results = paginatedItems.map(i => ({
      symbol: i.ticker || i.Ticker || '',
      name: i.companyName || i.name || i.company || '',
      companyNameLocal: i.companyNameLocal || '',
      exchange: i.primaryExchange || i.exchange || '',
      country: i.country || i.market || ''
    }));

    console.log(`Search results: ${results.length} items, hasMore: ${hasMore}, total: ${totalCount}`);

    return res.status(200).json({ 
      success: true, 
      results, 
      page, 
      pageSize, 
      hasMore,
      total: totalCount  // Include total for debugging
    });
  } catch (err) {
    console.error('Search Error:', err);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

module.exports = router;
