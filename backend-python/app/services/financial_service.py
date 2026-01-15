"""
Financial data service for querying company profiles and financial statements.

This service handles:
- Company profile lookup (address, employees, board members, governance)
- Income statement queries (revenue, net income, earnings)
- Balance sheet queries (assets, liabilities, equity)

Data is pre-fetched and stored locally in MongoDB to avoid repeated yfinance API calls.
Use this instead of querying chart.py endpoints for financial data.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from core.config import db, logger


def get_company_profile(ticker: str) -> Optional[Dict[str, Any]]:
    """Get company profile data for a ticker.
    
    Includes:
    - Basic info (company name, website, phone)
    - Address components
    - Governance metrics (risk ratings)
    - Board members
    - Employee count
    - Currency and exchange info
    """
    if db is None:
        return None
    
    try:
        profile = db.company_profiles.find_one({"ticker": ticker.upper()})
        return profile
    except Exception as e:
        logger.error(f"Error fetching company profile for {ticker}: {e}")
        return None


def get_latest_income_statement(ticker: str) -> Optional[Dict[str, Any]]:
    """Get the most recent income statement for a ticker.
    
    Returns latest fiscal period with metrics like:
    - Total Revenue
    - Net Income
    - Operating Income
    - Diluted/Basic EPS
    - EBITDA
    """
    if db is None:
        return None
    
    try:
        stmt = db.income_statements.find_one(
            {"ticker": ticker.upper()},
            sort=[("fiscalDate", -1)]
        )
        return stmt
    except Exception as e:
        logger.error(f"Error fetching income statement for {ticker}: {e}")
        return None


def get_income_statements(
    ticker: str, 
    period_type: Optional[str] = None,
    limit: int = 8,
    sort_order: int = -1
) -> List[Dict[str, Any]]:
    """Get multiple income statements for a ticker.
    
    Args:
        ticker: Stock ticker
        period_type: Filter by 'annual' or 'quarterly' (None = all)
        limit: Maximum number of records to return (default 8)
        sort_order: 1 for ascending (oldest first), -1 for descending (newest first)
    
    Returns:
        List of income statement records, sorted by fiscalDate
    """
    if db is None:
        return []
    
    try:
        query = {"ticker": ticker.upper()}
        if period_type:
            query["periodType"] = period_type
        
        stmts = list(db.income_statements.find(query).sort("fiscalDate", sort_order).limit(limit))
        return stmts
    except Exception as e:
        logger.error(f"Error fetching income statements for {ticker}: {e}")
        return []


def get_latest_balance_sheet(ticker: str) -> Optional[Dict[str, Any]]:
    """Get the most recent balance sheet for a ticker.
    
    Returns latest fiscal period with assets, liabilities, and equity metrics.
    """
    if db is None:
        return None
    
    try:
        bs = db.balance_sheets.find_one(
            {"ticker": ticker.upper()},
            sort=[("fiscalDate", -1)]
        )
        return bs
    except Exception as e:
        logger.error(f"Error fetching balance sheet for {ticker}: {e}")
        return None


def get_balance_sheets(
    ticker: str,
    period_type: Optional[str] = None,
    limit: int = 8,
    sort_order: int = -1
) -> List[Dict[str, Any]]:
    """Get multiple balance sheets for a ticker.
    
    Args:
        ticker: Stock ticker
        period_type: Filter by 'annual' or 'quarterly' (None = all)
        limit: Maximum number of records to return (default 8)
        sort_order: 1 for ascending (oldest first), -1 for descending (newest first)
    
    Returns:
        List of balance sheet records, sorted by fiscalDate
    """
    if db is None:
        return []
    
    try:
        query = {"ticker": ticker.upper()}
        if period_type:
            query["periodType"] = period_type
        
        bss = list(db.balance_sheets.find(query).sort("fiscalDate", sort_order).limit(limit))
        return bss
    except Exception as e:
        logger.error(f"Error fetching balance sheets for {ticker}: {e}")
        return []


def get_financial_summary(ticker: str) -> Dict[str, Any]:
    """Get a comprehensive financial summary combining latest statements and profile.
    
    Useful for dashboard displays, company info pages, etc.
    """
    if db is None:
        return {}
    
    try:
        profile = get_company_profile(ticker) or {}
        income_stmt = get_latest_income_statement(ticker) or {}
        balance_sheet = get_latest_balance_sheet(ticker) or {}
        
        summary = {
            'ticker': ticker.upper(),
            'profile': {
                'companyName': profile.get('companyName'),
                'industry': profile.get('industry'),
                'sector': profile.get('sector'),
                'website': profile.get('website'),
                'fullTimeEmployees': profile.get('fullTimeEmployees'),
                'businessSummary': profile.get('businessSummary'),
            },
            'latestIncome': {
                'fiscalDate': income_stmt.get('fiscalDate'),
                'metrics': income_stmt.get('metrics', {})
            },
            'latestBalance': {
                'fiscalDate': balance_sheet.get('fiscalDate'),
                'assets': balance_sheet.get('assets', {}),
                'liabilities': balance_sheet.get('liabilities', {}),
                'equity': balance_sheet.get('equity', {})
            }
        }
        
        return summary
    except Exception as e:
        logger.error(f"Error building financial summary for {ticker}: {e}")
        return {}


def get_net_income_history(ticker: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Get historical Net Income values from income statements.
    
    Useful for trend analysis and earnings history displays.
    """
    if db is None:
        return []
    
    try:
        stmts = get_income_statements(ticker, limit=limit, sort_order=1)  # oldest first
        
        history = []
        for stmt in stmts:
            metrics = stmt.get('metrics', {})
            net_income = metrics.get('Net Income')
            
            if net_income is not None:
                history.append({
                    'fiscalDate': stmt.get('fiscalDate'),
                    'netIncome': net_income,
                    'eps': metrics.get('Diluted EPS') or metrics.get('Basic EPS'),
                    'revenue': metrics.get('Total Revenue') or metrics.get('Operating Revenue'),
                })
        
        return history
    except Exception as e:
        logger.error(f"Error fetching net income history for {ticker}: {e}")
        return []


def get_board_members(ticker: str) -> List[Dict[str, Any]]:
    """Get list of board members/company officers."""
    if db is None:
        return []
    
    try:
        profile = get_company_profile(ticker)
        if profile:
            return profile.get('boardMembers', [])
        return []
    except Exception as e:
        logger.error(f"Error fetching board members for {ticker}: {e}")
        return []


def get_financial_ratios(ticker: str) -> Dict[str, Any]:
    """Calculate common financial ratios from latest statements.
    
    Includes:
    - Profit Margin (Net Income / Revenue)
    - ROA (Return on Assets)
    - ROE (Return on Equity)
    - Debt-to-Equity ratio
    - Current Ratio
    - Quick Ratio (simplified)
    """
    if db is None:
        return {}
    
    try:
        income_stmt = get_latest_income_statement(ticker)
        balance_sheet = get_latest_balance_sheet(ticker)
        
        if not income_stmt or not balance_sheet:
            return {}
        
        metrics = income_stmt.get('metrics', {})
        assets = balance_sheet.get('assets', {})
        liabilities = balance_sheet.get('liabilities', {})
        equity = balance_sheet.get('equity', {})
        
        net_income = metrics.get('Net Income', 0)
        revenue = metrics.get('Total Revenue') or metrics.get('Operating Revenue', 1)
        total_assets = assets.get('Total Assets', 1)
        total_liabilities = liabilities.get('Total Liabilities', 0)
        total_equity = equity.get('Total Equity', 1)
        
        ratios = {}
        
        # Profit Margin
        if revenue:
            ratios['profitMargin'] = (net_income / revenue) * 100
        
        # ROA (Return on Assets)
        if total_assets:
            ratios['roa'] = (net_income / total_assets) * 100
        
        # ROE (Return on Equity)
        if total_equity:
            ratios['roe'] = (net_income / total_equity) * 100
        
        # Debt-to-Equity
        if total_equity:
            ratios['debtToEquity'] = total_liabilities / total_equity
        
        # Current Ratio (simplified - need current assets and current liabilities)
        current_assets = assets.get('Current Assets')
        current_liabilities = liabilities.get('Current Liabilities')
        if current_assets and current_liabilities:
            ratios['currentRatio'] = current_assets / current_liabilities
        
        return ratios
    except Exception as e:
        logger.error(f"Error calculating financial ratios for {ticker}: {e}")
        return {}
