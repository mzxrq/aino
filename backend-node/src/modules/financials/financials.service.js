/**
 * financials.service.js
 * Service layer for fetching financial data from MongoDB collections
 * (incomeStmt, balSheet) and transforming to table format
 */

const { getDb } = require('../../config/db');

/**
 * Fetch income statement data for a ticker
 * @param {string} ticker - Stock ticker symbol
 * @returns {Array} Array of documents with metrics transformed to table format
 */
async function getIncomeStatement(ticker) {
  try {
    const db = getDb();
    if (!db) {
      console.warn('getIncomeStatement: Database not available');
      return [];
    }

    const collection = db.collection('incomeStmt');
    const docs = await collection
      .find({ ticker: ticker.toUpperCase() })
      .sort({ fiscalDate: -1 })
      .toArray();

    if (!docs || docs.length === 0) {
      return [];
    }

    // Return raw array; frontend transforms to table format
    return docs;
  } catch (err) {
    console.error(`Error fetching income statement for ${ticker}:`, err);
    return [];
  }
}

/**
 * Fetch balance sheet data for a ticker
 * @param {string} ticker - Stock ticker symbol
 * @returns {Array} Array of documents with nested sections (assets, liabilities, equity)
 */
async function getBalanceSheet(ticker) {
  try {
    const db = getDb();
    if (!db) {
      console.warn('getBalanceSheet: Database not available');
      return [];
    }

    const collection = db.collection('balSheet');
    const docs = await collection
      .find({ ticker: ticker.toUpperCase() })
      .sort({ fiscalDate: -1 })
      .toArray();

    if (!docs || docs.length === 0) {
      return [];
    }

    // Return raw array; frontend transforms to table format and flattens nested structure
    return docs;
  } catch (err) {
    console.error(`Error fetching balance sheet for ${ticker}:`, err);
    return [];
  }
}

/**
 * Fetch cash flow data for a ticker (optional, for future use)
 * @param {string} ticker - Stock ticker symbol
 * @returns {Array} Array of documents
 */
async function getCashFlow(ticker) {
  try {
    const db = getDb();
    if (!db) {
      console.warn('getCashFlow: Database not available');
      return [];
    }

    const collection = db.collection('cashFlow');
    const docs = await collection
      .find({ ticker: ticker.toUpperCase() })
      .sort({ fiscalDate: -1 })
      .toArray();

    if (!docs || docs.length === 0) {
      return [];
    }

    return docs;
  } catch (err) {
    console.error(`Error fetching cash flow for ${ticker}:`, err);
    return [];
  }
}

module.exports = {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow
};
