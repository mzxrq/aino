from fastapi import APIRouter, HTTPException
from typing import Any, Dict
import json
import hashlib
from datetime import datetime, timedelta
import yfinance as yf

from core.config import db, logger

router = APIRouter()


def _load_from_cache(key: str, ttl_seconds: int):
    if db is None:
        return None
    rec = db.cache.find_one({"_id": key})
    if not rec:
        return None
    fetched = rec.get("fetched_at")
    if not fetched:
        return None
    if (datetime.utcnow() - fetched).total_seconds() > ttl_seconds:
        return None
    return rec.get("payload")


def _save_to_cache(key: str, payload: Dict[str, Any]):
    if db is None:
        return
    db.cache.update_one(
        {"_id": key},
        {"$set": {"payload": payload, "fetched_at": datetime.utcnow()}},
        upsert=True,
    )


def _format_phone(phone: str, country: str = None) -> str:
    if not phone:
        return ''
    p = str(phone).strip()
    # If already has +, return as-is
    if p.startswith('+'):
        return p
    # remove non-digits
    import re
    digits = re.sub(r"\D", "", p)
    if not digits:
        return p

    if country.lower() in ('japan'):
        if digits.startswith('81'):
            rest = digits[2:]
            if len(rest) == 9:
                return f"(+81) {rest[0]} {rest[1:5]} {rest[5:]}"
            return f"(+81) {rest}"

    # Thailand heuristic
    if country.lower() in ('thailand'):
        if digits.startswith('0'):
            digits = digits[1:]
        return f"(+66) {digits[:2]} {digits[2:5]} {digits[5:]}" if len(digits) >= 9 else f"(+66) {digits}"
    # US heuristic
    if len(digits) == 10:
        return f"(+1) {digits[:3]} {digits[3:6]} {digits[6:]}"
    # default: show with leading +
    return f"{digits}"


@router.get('/company/info')
def company_info(ticker: str):
    if not ticker:
        raise HTTPException(status_code=400, detail='ticker required')
    key = f"ticker_info::{ticker.upper()}"
    # TTL: 7 days
    ttl = 86400 * 7
    try:
        cached = _load_from_cache(key, ttl)
        if cached:
            return cached
    except Exception:
        logger.debug('company_info: cache load failed')

    try:
        yt = yf.Ticker(ticker)
        # prefer get_info() if available
        info = {}
        try:
            info = yt.get_info() or {}
        except Exception:
            try:
                info = yt.info or {}
            except Exception:
                info = {}

        # Basic normalization
        payload = {}
        payload['symbol'] = info.get('symbol') or ticker.upper()
        payload['shortName'] = info.get('shortName') or info.get('short_name') or info.get('short')
        payload['longName'] = info.get('longBusinessSummary') and info.get('longName') or info.get('longName') or info.get('longBusinessSummary')
        payload['industry'] = info.get('industry')
        payload['sector'] = info.get('sector')

        # Address fields
        payload['address1'] = info.get('address1') or info.get('address') or ''
        payload['address2'] = info.get('address2') or ''
        payload['city'] = info.get('city') or ''
        payload['zip'] = info.get('zip') or info.get('postalCode') or ''
        payload['country'] = info.get('country') or info.get('fullExchangeName') or ''

        # Website and phone (formatted)
        payload['website'] = info.get('website') or info.get('websiteUrl') or ''
        payload['phone'] = _format_phone(info.get('phone') or info.get('telephone') or '', payload.get('country'))

        # Officers table
        officers = info.get('companyOfficers') or info.get('officers') or []
        # Normalize officers to minimal fields
        norm_officers = []
        for o in officers:
            norm_officers.append({
                'title': o.get('title') or o.get('position') or '',
                'name': o.get('name') or '',
                'fiscalYear': o.get('fiscalYear') or o.get('since') or o.get('year') or None
            })
        payload['companyOfficers'] = norm_officers

        # Financials / metrics: add a small subset useful for UI
        for k in ('marketCap','dividendRate','dividendYield','beta','trailingPE','forwardPE','currency'):
            if k in info:
                payload[k] = info.get(k)

        # include raw info for further inspection, but trim if too large
        try:
            raw_str = json.dumps(info, ensure_ascii=False)
            raw_len = len(raw_str)
        except Exception:
            raw_str = ''
            raw_len = 0

        # If raw payload is large, store a compact summary + hash instead
        RAW_THRESHOLD = 20 * 1024  # 20 KB
        if raw_len and raw_len > RAW_THRESHOLD:
            try:
                h = hashlib.sha256(raw_str.encode('utf-8')).hexdigest()
            except Exception:
                h = ''
            payload['raw_summary'] = {
                'length': raw_len,
                'sha256': h,
                'sample_keys': list(info.keys())[:20]
            }
            # capture a few useful short fields when present
            snippets = {}
            for k in ('longBusinessSummary', 'shortName', 'website', 'industry', 'sector'):
                if k in info and info.get(k):
                    snippets[k] = info.get(k)
            if snippets:
                payload['raw_snippets'] = snippets
        else:
            payload['raw'] = info

        try:
            _save_to_cache(key, payload)
        except Exception:
            logger.debug('company_info: cache save failed')

        return payload
    except Exception as e:
        logger.exception(f'company_info error for {ticker}: {e}')
        raise HTTPException(status_code=500, detail='failed to fetch company info')
