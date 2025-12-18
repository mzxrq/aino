// NOTE: `formatToUserTZ` was removed because it was unused in the codebase.

export function isIsoLike(s) {
  if (!s || typeof s !== 'string') return false;
  // common ISO-like forms: 2023-01-02, 2023-01-02T12:00, 2023/01/02, or space separator
  return (/^\d{4}[-\/]\d{2}[-\/]\d{2}(?:[T\s].*)?$/.test(s));
}

export function normalizeTimestampToMs(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  // pure digits
  if (!/^\d+$/.test(s)) return null;
  try {
    const n = Number(s);
    if (Number.isNaN(n)) return null;
    // heuristics: >=1e12 likely milliseconds; between 1e9 and 1e12 likely seconds
    if (n >= 1e12) return n;
    if (n >= 1e9) return n * 1000;
    // small numbers unlikely timestamps
    return null;
  } catch (e) {
    return null;
  }
}

// Format date as YYYY/MM/DD HH:mm:ss (optionally include timezone short name)
export function formatToUserTZSlash(input, timeZone, includeTZ = false) {
  if (input === null || input === undefined || input === '') return '';
  let d;
  if (input instanceof Date) d = input;
  else {
    const ts = normalizeTimestampToMs(input);
    if (ts !== null) d = new Date(ts);
    else {
      try { d = new Date(String(input)); } catch (e) { return String(input); }
    }
  }
  if (!d || isNaN(d)) return String(input);

  try {
    const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const df = new Intl.DateTimeFormat(undefined, Object.assign({}, opts, timeZone ? { timeZone } : {}));
    const parts = df.formatToParts(d);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const y = map.year || '';
    const m = map.month || '';
    const day = map.day || '';
    const hh = map.hour || '00';
    const mm = map.minute || '00';
    const ss = map.second || '00';
    let out = `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
    if (includeTZ) {
      // attempt to get short timezone name
      try {
        const tzName = new Intl.DateTimeFormat(undefined, Object.assign({}, { timeZoneName: 'short' }, timeZone ? { timeZone } : {})).formatToParts(d).find(p => p.type === 'timeZoneName');
        if (tzName && tzName.value) out += ` ${tzName.value}`;
      } catch (e) { /* ignore */ }
    }
    return out;
  } catch (e) {
    try { return d.toLocaleString(); } catch (err) { return String(input); }
  }
}
