/**
 * Get the appropriate company name based on current language and ticker type.
 * For JP companies (.T/.t or country JP): show companyNameLocal (Japanese) when locale starts with 'ja' or 'jp', or when locale is non-English and local exists; else companyName (English)
 * For TH companies (.BK/.bk or country TH): show companyNameLocal (Thai) when locale starts with 'th' or locale is non-English with local present; else companyName (English)
 * For US/other: always show companyName (English)
 *
 * @param {Object} companyData - Company object with companyName, companyNameLocal, ticker, displayTicker
 * @param {string} locale - Current Lingui locale (e.g., 'en', 'ja', 'th')
 * @returns {string} - The appropriate company name to display
 */
export function getLocalizedCompanyName(companyData = {}, locale = 'en') {
  if (!companyData) return '';

  const ticker = (companyData.ticker || companyData.displayTicker || '').toUpperCase();
  const country = (companyData.country || '').toUpperCase();
  const hasLocal = Boolean(companyData.companyNameLocal && companyData.companyNameLocal.trim());
  const localePrefix = (locale || '').toLowerCase().split('-')[0];
  // Accept 'jp' as alias for Japanese (some environments use it)
  const isJa = localePrefix === 'ja' || localePrefix === 'jp';

  // JP companies
  if (ticker.endsWith('.T') || country === 'JP') {
    if ((isJa || (localePrefix && localePrefix !== 'en')) && hasLocal) {
      return companyData.companyNameLocal.trim();
    }
    return companyData.companyName || '';
  }

  // TH companies
  if (ticker.endsWith('.BK') || country === 'TH') {
    if ((localePrefix === 'th' || (localePrefix && localePrefix !== 'en')) && hasLocal) {
      return companyData.companyNameLocal.trim();
    }
    return companyData.companyName || '';
  }

  // US/other: always English
  return companyData.companyName || '';
}
