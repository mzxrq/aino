// Simple in-memory fetch cache with deduplication and TTL
const cache = new Map();

/**
 * Fetch with in-memory cache. Deduplicates concurrent requests and caches responses for `ttl` ms.
 * Returns parsed JSON.
 */
export async function fetchWithCache(url, { ttl = 60000, fetchOptions = {} } = {}) {
  const now = Date.now();
  const entry = cache.get(url);
  if (entry) {
    // valid cached JSON
    if (now - entry.ts < entry.ttl) {
      return entry.value;
    }
    // if an in-flight promise exists, reuse it
    if (entry.promise) {
      return entry.promise;
    }
  }

  // create a promise and store as in-flight to deduplicate concurrent calls
  const controller = new AbortController();
  const signal = controller.signal;
  const p = (async () => {
    try {
      const res = await fetch(url, { signal, ...fetchOptions });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      cache.set(url, { value: json, ts: Date.now(), ttl, promise: null });
      return json;
    } catch (e) {
      // remove failed promise entry so future calls can retry
      const cur = cache.get(url);
      if (cur && cur.promise === p) cache.delete(url);
      throw e;
    }
  })();

  cache.set(url, { value: null, ts: now, ttl, promise: p });
  return p;
}

export function clearFetchCache(url) {
  if (url) cache.delete(url);
  else cache.clear();
}
