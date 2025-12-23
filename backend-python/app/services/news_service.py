import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import yfinance as yf


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _compute_display_time(pub_dt: Optional[datetime]) -> Optional[str]:
    if pub_dt is None:
        return None
    now = datetime.now(timezone.utc)
    if pub_dt.tzinfo is None:
        pub_dt = pub_dt.replace(tzinfo=timezone.utc)
    delta = now - pub_dt
    if delta <= timedelta(days=5):
        if delta.days >= 1:
            return f"{delta.days}d ago"
        hours = delta.seconds // 3600
        if hours >= 1:
            return f"{hours}h ago"
        minutes = (delta.seconds % 3600) // 60
        if minutes >= 1:
            return f"{minutes}m ago"
        return "just now"
    return pub_dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _normalize_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    # preserve original shape so we can include full raw payload later
    original = raw
    # sometimes yfinance returns an envelope with a 'content' dict
    if isinstance(raw, dict) and 'content' in raw and isinstance(raw['content'], dict):
        raw = raw['content']

    item_id = raw.get('uuid') or raw.get('id') or raw.get('guid') or str(uuid.uuid4())
    title = raw.get('title') or raw.get('headline') or raw.get('summary') or raw.get('description') or ''
    summary = raw.get('summary') or raw.get('description') or ''

    pub = None
    if raw.get('providerPublishTime'):
        try:
            pub = datetime.fromtimestamp(int(raw.get('providerPublishTime')), tz=timezone.utc)
        except Exception:
            pub = None
    if not pub and raw.get('pubDate'):
        pd = raw.get('pubDate')
        try:
            if isinstance(pd, str) and pd.endswith('Z'):
                pub = datetime.strptime(pd, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
            else:
                pub = datetime.fromisoformat(pd)
        except Exception:
            pub = None

    # thumbnail handling: prefer originalUrl/url if nested dict, else raw url string
    thumbnail = None
    if isinstance(raw.get('thumbnail'), dict):
        thumb = raw.get('thumbnail')
        thumbnail = thumb.get('originalUrl') or thumb.get('url') or thumb.get('thumbnail') or None
    elif raw.get('image'):
        thumbnail = raw.get('image')
    elif raw.get('summary_img'):
        thumbnail = raw.get('summary_img')

    content_type = 'STORY'
    if raw.get('contentType'):
        content_type = raw.get('contentType')
    elif raw.get('type'):
        content_type = raw.get('type')

    normalized = {
        'id': item_id,
        'content': {
            'id': item_id,
            'contentType': (content_type.upper() if isinstance(content_type, str) else 'STORY'),
            'title': title,
            'description': summary,
            'summary': summary,
            'pubDate': _to_iso(pub) or (raw.get('pubDate') if isinstance(raw.get('pubDate'), str) else None),
            'displayTime': _compute_display_time(pub) or (raw.get('displayTime') if raw.get('displayTime') else None),
            'thumbnail': ({'originalUrl': thumbnail} if thumbnail else None),
            'raw': original,
        }
    }
    return normalized


def fetch_news_for_ticker(ticker: str, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
    ticker = ticker or ''
    if not ticker:
        return {'items': [], 'total': 0, 'page': page, 'pageSize': page_size, 'totalPages': 0}

    try:
        t = yf.Ticker(ticker)
        raw_news = []
        if hasattr(t, 'get_news'):
            try:
                raw_news = t.get_news()
            except Exception:
                raw_news = []
        if not raw_news and hasattr(t, 'news'):
            try:
                raw_news = t.news
            except Exception:
                raw_news = []

        normalized = [_normalize_item(r) for r in raw_news]

        total = len(normalized)
        start = max(0, (page - 1) * page_size)
        end = start + page_size
        page_items = normalized[start:end]

        return {
            'items': page_items,
            'total': total,
            'page': page,
            'pageSize': page_size,
            'totalPages': (total + page_size - 1) // page_size if page_size > 0 else 1,
        }

    except Exception as e:
        return {'items': [], 'total': 0, 'page': page, 'pageSize': page_size, 'totalPages': 0, 'error': str(e)}
