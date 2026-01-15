/**
 * Get the appropriate company name based on current language and ticker type.
 * For JP companies (.T/.t): show companyNameLocal (Japanese) when locale is 'ja', else companyName (English)
 * For TH companies (.BK/.bk): show companyNameLocal (Thai) when locale is 'th', else companyName (English)
 * For US/other: always show companyName (English)
 *
 * @param {Object} companyData - Company object with companyName, companyNameLocal, ticker, displayTicker
 * @param {string} locale - Current Lingui locale (e.g., 'en', 'ja', 'th')
 * @returns {string} - The appropriate company name to display
 */
export function getLocalizedCompanyName(companyData = {}, locale = 'en') {
  if (!companyData) return '';

  const ticker = (companyData.ticker || companyData.displayTicker || '').toUpperCase();
  const hasLocal = Boolean(companyData.companyNameLocal && companyData.companyNameLocal.trim());

  // JP companies
  if (ticker.endsWith('.T')) {
    if (locale === 'ja' && hasLocal) {
      return companyData.companyNameLocal.trim();
    }
    return companyData.companyName || '';
  }

  // TH companies
  if (ticker.endsWith('.BK')) {
    if (locale === 'th' && hasLocal) {
      return companyData.companyNameLocal.trim();
    }
    return companyData.companyName || '';
  }

  // US/other: always English
  return companyData.companyName || '';
}
