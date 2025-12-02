import { useEffect, useState } from 'react';

export function useMetadataEnrichment(ticker, NODE_API_URL, deriveMarketFromTicker, stripSuffix) {
  const [meta, setMeta] = useState({ companyName: null, market: deriveMarketFromTicker(ticker) });

  useEffect(() => {
    let cancelled = false;
    async function enrich() {
      if (!ticker) return;
      try {
        const q1 = encodeURIComponent(ticker);
        let res = await fetch(`${NODE_API_URL}/chart/ticker/${q1}`);
        let list = [];
        try { list = await res.json(); } catch { list = []; }
        if ((!res.ok || !Array.isArray(list) || list.length === 0) && ticker) {
          const base = encodeURIComponent(stripSuffix(ticker));
            const res2 = await fetch(`${NODE_API_URL}/chart/ticker/${base}`);
            try { list = await res2.json(); } catch { list = []; }
        }
        if (cancelled) return;
        if (Array.isArray(list) && list.length) {
          const exact = list.find(r => (r.ticker || '').toUpperCase() === String(ticker).toUpperCase()) || list[0];
          setMeta({
            companyName: exact.name || exact.company || stripSuffix(ticker),
            market: exact.market || deriveMarketFromTicker(ticker)
          });
        } else {
          setMeta(prev => ({
            companyName: prev.companyName || stripSuffix(ticker),
            market: prev.market || deriveMarketFromTicker(ticker)
          }));
        }
      } catch {
        if (!cancelled) {
          setMeta(prev => ({
            companyName: prev.companyName || stripSuffix(ticker),
            market: prev.market || deriveMarketFromTicker(ticker)
          }));
        }
      }
    }
    enrich();
    return () => { cancelled = true; };
  }, [ticker, NODE_API_URL, deriveMarketFromTicker, stripSuffix]);

  return meta;
}
