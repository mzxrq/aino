#!/usr/bin/env python3
"""Simple script to inspect yfinance Ticker properties for debugging.
Usage: python test_yfinance.py 9020.T
Prints JSON with types and small samples for each field.
"""
import sys
import json
import traceback
from datetime import datetime

try:
    import yfinance as yf
    import pandas as pd
except Exception as e:
    print(json.dumps({"error": "missing dependency", "exc": str(e)}))
    raise

FIELDS = [
    'financials', 'income_stmt', 'balance_sheet', 'cashflow', 'cash_flow', 'earnings',
    'news', 'major_holders', 'institutional_holders', 'mutualfund_holders',
    'get_insider_purchases', 'get_insider_transactions', 'recommendations'
]


def normalize(obj):
    """Return a JSON-serializable representation and a short sample."""
    try:
        if obj is None:
            return {'type': 'None', 'sample': None}
        if callable(obj):
            try:
                val = obj()
            except Exception as e:
                return {'type': 'callable', 'sample': f'call failed: {e}'}
            return normalize(val)
        if hasattr(obj, 'to_dict'):
            try:
                d = obj.to_dict()
                # normalize keys to strings and reduce size
                def stringify_value(v):
                    try:
                        # pandas timestamps / numpy types
                        import pandas as _pd
                        if isinstance(v, _pd.Timestamp):
                            return str(v)
                    except Exception:
                        pass
                    try:
                        from datetime import datetime as _dt
                        if isinstance(v, _dt):
                            return v.isoformat()
                    except Exception:
                        pass
                    # fallback for iterables
                    try:
                        if isinstance(v, dict):
                            return safe_map(v)
                        if hasattr(v, '__iter__') and not isinstance(v, (str, bytes, dict)):
                            return [stringify_value(x) for x in list(v)[:3]]
                    except Exception:
                        return str(v)
                    return v

                def safe_map(o):
                    if isinstance(o, dict):
                        outd = {}
                        for i,(k,v) in enumerate(o.items()):
                            if i >= 10:
                                break
                            sk = str(k)
                            if isinstance(v, dict):
                                outd[sk] = safe_map(v)
                            else:
                                outd[sk] = stringify_value(v)
                        return outd
                sample = safe_map(d)
                return {'type': type(obj).__name__, 'sample': sample, 'full_keys': [str(k) for k in list(d.keys())[:10]]}
            except Exception:
                pass
        if isinstance(obj, (list, tuple)):
            return {'type': type(obj).__name__, 'sample': obj[:5]}
        if isinstance(obj, dict):
            sample = {}
            for i,(k,v) in enumerate(obj.items()):
                if i >= 10:
                    break
                sample[str(k)] = v if i < 5 else '...'
            return {'type': 'dict', 'sample': sample}
        # pandas DataFrame fallback
        if hasattr(obj, 'head') and hasattr(obj, 'to_json'):
            try:
                head = obj.head(3).to_dict()
                return {'type': 'DataFrame', 'sample': head}
            except Exception:
                return {'type': 'DataFrame', 'sample': str(obj.shape)}
        return {'type': type(obj).__name__, 'sample': str(obj)}
    except Exception:
        return {'type': 'unknown', 'sample': traceback.format_exc()}


def inspect_ticker(ticker):
    out = {'ticker': ticker, 'fetched_at': datetime.utcnow().isoformat() + 'Z', 'fields': {}}
    t = yf.Ticker(ticker)
    for f in FIELDS:
        try:
            val = getattr(t, f, None)
            out['fields'][f] = normalize(val)
        except Exception as e:
            out['fields'][f] = {'type': 'error', 'sample': str(e)}
    # also include common direct props
    try:
        props = ['info']
        for p in props:
            val = getattr(t, p, None)
            out['fields'][p] = normalize(val)
    except Exception as e:
        out['fields']['info'] = {'type': 'error', 'sample': str(e)}
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python test_yfinance.py TICKER1 [TICKER2 ...]')
        sys.exit(2)
    results = []
    for tk in sys.argv[1:]:
        try:
            results.append(inspect_ticker(tk))
        except Exception as e:
            results.append({'ticker': tk, 'error': str(e), 'trace': traceback.format_exc()})
    print(json.dumps(results, indent=2, ensure_ascii=False))
