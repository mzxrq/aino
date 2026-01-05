/** marketlist.model.js
 *  ----------------------
 *  Market list schema and collection name
 */

const COLLECTION_NAME = "marketlists";

function MarketListSchema(data = {}) {
    return {
        ticker: (data.ticker || data.symbol || "").toString().toUpperCase(),
        market: (data.market || "US").toString().toUpperCase(),
        name: data.name ? data.name.toString() : "",
        sector: data.sector ? data.sector.toString() : "",
        industry: data.industry ? data.industry.toString() : "",
        addedAt: data.addedAt ? new Date(data.addedAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
}

module.exports = {
    COLLECTION_NAME,
    MarketListSchema,
};