/**
 * financialLabels.ts
 * 
 * Provides localized labels for financial data fields and company information.
 * Uses Lingui i18n for extractable translations into multiple languages.
 * 
 * Usage:
 *   import { getFinancialLabel } from '@/utils/financialLabels';
 *   const label = getFinancialLabel('totalRevenue');  // "Total Revenue" or "総売上高"
 */

import { i18n } from '@lingui/core';

// Financial metrics - Income Statement
const INCOME_STMT_FIELDS: Record<string, () => string> = {
  'totalRevenue': () => i18n._('Total Revenue'),
  'revenue': () => i18n._('Total Revenue'),
  'netIncome': () => i18n._('Net Income'),
  'net_income': () => i18n._('Net Income'),
  'operatingIncome': () => i18n._('Operating Income'),
  'operating_income': () => i18n._('Operating Income'),
  'operatingExpense': () => i18n._('Operating Expense'),
  'operating_expense': () => i18n._('Operating Expense'),
  'ebitda': () => i18n._('EBITDA'),
  'EBITDA': () => i18n._('EBITDA'),
  'basicEPS': () => i18n._('Basic EPS'),
  'dilutedEPS': () => i18n._('Diluted EPS'),
  'eps': () => i18n._('EPS'),
  'taxProvision': () => i18n._('Tax Provision'),
  'tax_provision': () => i18n._('Tax Provision'),
  'interestExpense': () => i18n._('Interest Expense'),
  'interest_expense': () => i18n._('Interest Expense'),
  'grossProfit': () => i18n._('Gross Profit'),
  'gross_profit': () => i18n._('Gross Profit'),
  'costOfRevenue': () => i18n._('Cost of Revenue'),
  'cost_of_revenue': () => i18n._('Cost of Revenue'),
};

// Financial metrics - Balance Sheet
const BALANCE_SHEET_FIELDS: Record<string, () => string> = {
  'totalAssets': () => i18n._('Total Assets'),
  'total_assets': () => i18n._('Total Assets'),
  'totalLiabilities': () => i18n._('Total Liabilities'),
  'total_liabilities': () => i18n._('Total Liabilities'),
  'totalEquity': () => i18n._('Total Equity'),
  'total_equity': () => i18n._('Total Equity'),
  'totalCurrentAssets': () => i18n._('Total Current Assets'),
  'total_current_assets': () => i18n._('Total Current Assets'),
  'totalCurrentLiabilities': () => i18n._('Total Current Liabilities'),
  'total_current_liabilities': () => i18n._('Total Current Liabilities'),
  'totalNonCurrentAssets': () => i18n._('Total Non-Current Assets'),
  'total_non_current_assets': () => i18n._('Total Non-Current Assets'),
  'totalNonCurrentLiabilities': () => i18n._('Total Non-Current Liabilities'),
  'total_non_current_liabilities': () => i18n._('Total Non-Current Liabilities'),
  'cash': () => i18n._('Cash and Cash Equivalents'),
  'cashAndCashEquivalents': () => i18n._('Cash and Cash Equivalents'),
  'shortTermInvestments': () => i18n._('Short-Term Investments'),
  'short_term_investments': () => i18n._('Short-Term Investments'),
  'accountsReceivable': () => i18n._('Accounts Receivable'),
  'accounts_receivable': () => i18n._('Accounts Receivable'),
  'inventory': () => i18n._('Inventory'),
  'propertyPlantEquipment': () => i18n._('Property, Plant & Equipment'),
  'property_plant_equipment': () => i18n._('Property, Plant & Equipment'),
  'intangibleAssets': () => i18n._('Intangible Assets'),
  'intangible_assets': () => i18n._('Intangible Assets'),
  'goodwill': () => i18n._('Goodwill'),
  'accountsPayable': () => i18n._('Accounts Payable'),
  'accounts_payable': () => i18n._('Accounts Payable'),
  'shortTermDebt': () => i18n._('Short-Term Debt'),
  'short_term_debt': () => i18n._('Short-Term Debt'),
  'longTermDebt': () => i18n._('Long-Term Debt'),
  'long_term_debt': () => i18n._('Long-Term Debt'),
  'stockholderEquity': () => i18n._("Stockholder's Equity"),
  'stockholder_equity': () => i18n._("Stockholder's Equity"),
  'retainedEarnings': () => i18n._('Retained Earnings'),
  'retained_earnings': () => i18n._('Retained Earnings'),
};

// Financial metrics - Cash Flow
const CASH_FLOW_FIELDS: Record<string, () => string> = {
  'operatingCashFlow': () => i18n._('Operating Cash Flow'),
  'operating_cash_flow': () => i18n._('Operating Cash Flow'),
  'investingCashFlow': () => i18n._('Investing Cash Flow'),
  'investing_cash_flow': () => i18n._('Investing Cash Flow'),
  'financingCashFlow': () => i18n._('Financing Cash Flow'),
  'financing_cash_flow': () => i18n._('Financing Cash Flow'),
  'freeCashFlow': () => i18n._('Free Cash Flow'),
  'free_cash_flow': () => i18n._('Free Cash Flow'),
  'capitalExpenditures': () => i18n._('Capital Expenditures'),
  'capital_expenditures': () => i18n._('Capital Expenditures'),
  'dividendsPaid': () => i18n._('Dividends Paid'),
  'dividends_paid': () => i18n._('Dividends Paid'),
  'changeInCash': () => i18n._('Change in Cash'),
  'change_in_cash': () => i18n._('Change in Cash'),
};

// Company Profile Fields
const COMPANY_INFO_FIELDS: Record<string, () => string> = {
  'industry': () => i18n._('Industry'),
  'sector': () => i18n._('Sector'),
  'website': () => i18n._('Website'),
  'phone': () => i18n._('Phone'),
  'address1': () => i18n._('Address'),
  'address2': () => i18n._('Address Line 2'),
  'city': () => i18n._('City'),
  'state': () => i18n._('State/Province'),
  'zip': () => i18n._('Postal Code'),
  'country': () => i18n._('Country'),
  'companyName': () => i18n._('Company Name'),
  'company_name': () => i18n._('Company Name'),
  'employees': () => i18n._('Employees'),
  'founded': () => i18n._('Founded'),
  'longBusinessSummary': () => i18n._('Business Summary'),
  'long_business_summary': () => i18n._('Business Summary'),
  'shortName': () => i18n._('Short Name'),
  'short_name': () => i18n._('Short Name'),
  'longName': () => i18n._('Full Name'),
  'long_name': () => i18n._('Full Name'),
};

// Company Officers / Board Members
const OFFICER_FIELDS: Record<string, () => string> = {
  'title': () => i18n._('Title'),
  'name': () => i18n._('Name'),
  'fiscalYear': () => i18n._('Fiscal Year'),
  'fiscal_year': () => i18n._('Fiscal Year'),
  'salary': () => i18n._('Salary'),
  'exercisedValue': () => i18n._('Exercised Value'),
  'exercised_value': () => i18n._('Exercised Value'),
  'unexercisedValue': () => i18n._('Unexercised Value'),
  'unexercised_value': () => i18n._('Unexercised Value'),
};

// Header/Section Labels
const SECTION_LABELS: Record<string, () => string> = {
  'chart': () => i18n._('Chart'),
  'charts': () => i18n._('Charts'),
  'news': () => i18n._('News'),
  'financials': () => i18n._('Financials'),
  'financialStatements': () => i18n._('Financial Statements'),
  'financial_statements': () => i18n._('Financial Statements'),
  'incomeStatement': () => i18n._('Income Statement'),
  'income_statement': () => i18n._('Income Statement'),
  'balanceSheet': () => i18n._('Balance Sheet'),
  'balance_sheet': () => i18n._('Balance Sheet'),
  'cashFlow': () => i18n._('Cash Flow'),
  'cash_flow': () => i18n._('Cash Flow'),
  'marketCap': () => i18n._('Market Cap'),
  'market_cap': () => i18n._('Market Cap'),
  'companyInfo': () => i18n._('Company Information'),
  'company_info': () => i18n._('Company Information'),
  'executives': () => i18n._('Executives'),
  'boardMembers': () => i18n._('Board Members'),
  'board_members': () => i18n._('Board Members'),
  'updated': () => i18n._('Updated'),
  'noData': () => i18n._('No data'),
  'showMore': () => i18n._('Show more'),
  'showLess': () => i18n._('Show less'),
  'openChart': () => i18n._('Open Chart'),
  'close': () => i18n._('Close'),
};

// Status/State Labels
const STATUS_LABELS: Record<string, () => string> = {
  'active': () => i18n._('Active'),
  'inactive': () => i18n._('Inactive'),
  'delisted': () => i18n._('Delisted'),
  'suspended': () => i18n._('Suspended'),
  'new': () => i18n._('New'),
  'pending': () => i18n._('Pending'),
  'resolved': () => i18n._('Resolved'),
  'open': () => i18n._('Open'),
  'closed': () => i18n._('Closed'),
};

// Combined map of all fields
const ALL_FIELD_MAPS: Record<string, () => string> = {
  ...INCOME_STMT_FIELDS,
  ...BALANCE_SHEET_FIELDS,
  ...CASH_FLOW_FIELDS,
  ...COMPANY_INFO_FIELDS,
  ...OFFICER_FIELDS,
  ...SECTION_LABELS,
  ...STATUS_LABELS,
};

/**
 * Get localized label for a financial field name.
 * 
 * Handles snake_case and camelCase variants.
 * Returns the field name as-is if no translation is found.
 * 
 * @param fieldName - The field name (e.g., 'totalRevenue', 'total_revenue')
 * @returns Localized label string
 * 
 * @example
 * getFinancialLabel('totalRevenue')  // "Total Revenue" (en) or "総売上高" (ja)
 * getFinancialLabel('industry')      // "Industry" (en) or "業界" (ja)
 */
export function getFinancialLabel(fieldName: string): string {
  if (!fieldName) return '';
  
  // Try exact match first
  const fn = ALL_FIELD_MAPS[fieldName];
  if (fn) {
    return fn();
  }
  
  // Try snake_case variant
  const camelCase = fieldName.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
  const fnCamel = ALL_FIELD_MAPS[camelCase];
  if (fnCamel) {
    return fnCamel();
  }
  
  // Try snake_case conversion
  const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
  const fnSnake = ALL_FIELD_MAPS[snakeCase];
  if (fnSnake) {
    return fnSnake();
  }
  
  // Fallback: return original fieldName
  return fieldName;
}

/**
 * Get all labels for a specific category.
 * 
 * @param category - One of: 'income_stmt', 'balance_sheet', 'cash_flow', 'company_info', 'officer', 'section', 'status'
 * @returns Object with fieldName -> label mappings
 */
export function getLabelsByCategory(category: string) {
  const categoryMap: Record<string, Record<string, () => string>> = {
    income_stmt: INCOME_STMT_FIELDS,
    balance_sheet: BALANCE_SHEET_FIELDS,
    cash_flow: CASH_FLOW_FIELDS,
    company_info: COMPANY_INFO_FIELDS,
    officer: OFFICER_FIELDS,
    section: SECTION_LABELS,
    status: STATUS_LABELS,
  };
  
  const selected = categoryMap[category] || {};
  
  // Convert function map to label map
  return Object.fromEntries(
    Object.entries(selected).map(([key, fn]) => [key, fn()])
  );
}

/**
 * Hidden extraction container for Lingui string extraction.
 * This component is never rendered but ensures all strings are extracted.
 * 
 * React component for use in extraction - doesn't render in production
 */
export function _FinancialLabelsExtractor() {
  // This is not meant to be rendered, only to ensure strings are extracted
  // All strings are already captured by the i18n._() calls above
  return null;
}

/**
 * Example usage in a financial table:
 * 
 * import { getFinancialLabel } from '@/utils/financialLabels';
 * 
 * function FinancialsTable({ data, importantMetrics }) {
 *   return (
 *     <table>
 *       <tbody>
 *         {importantMetrics?.map(metricKey => (
 *           <tr key={metricKey}>
 *             <td><strong>{getFinancialLabel(metricKey)}</strong></td>
 *             <td>{formatNumber(data[metricKey])}</td>
 *           </tr>
 *         ))}
 *       </tbody>
 *     </table>
 *   );
 * }
 */
