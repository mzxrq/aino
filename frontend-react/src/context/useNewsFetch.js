import { useState, useEffect } from 'react';

export function useNewsFetch(ticker, apiBase, pyBase, fallbackData) {
  const [news, setNews] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let isMounted = true;

    const fetchNews = async () => {
      try {
        // 1. Try Top Viewed News
        const topRes = await fetch(`${apiBase}/node/news/views/top?limit=6`);
        if (topRes.ok && isMounted) {
          const payload = await topRes.json();
          const items = (payload.items || []).map((it, idx) => ({
            id: it.articleKey || idx,
            articleKey: it.articleKey || null,
            title: it.title || 'Market Update',
            source: it.source || 'News',
            link: it.url || null,
            thumbnail: it.thumbnail || null,
            pubDate: it.pubDate || null,
            views: it.views || 0
          }));
          if (items.length) {
            setNews(items);
            return;
          }
        }

        // 2. Try Node Proxy
        const res = await fetch(`${apiBase}/node/news?q=${encodeURIComponent(ticker)}&pageSize=6`);
        if (res.ok && isMounted) {
          const j = await res.json();
          const articles = (j.articles || []).map((n, idx) => ({
            id: idx,
            articleKey: n.articleKey || n.url || null,
            title: n.title || 'Market Update',
            source: n.source?.name || 'News',
            link: n.url || null,
            thumbnail: n.urlToImage || null,
            pubDate: n.publishedAt || null,
            views: 0
          }));
          if (articles.length) {
            setNews(articles);
            return;
          }
        }

        // 3. Final Fallback to Static/Loading
        if (isMounted) setNews(fallbackData);
      } catch (e) {
        if (isMounted) setNews(fallbackData);
      }
    };

    fetchNews();
    return () => { isMounted = false; };
  }, [ticker, apiBase, pyBase]); // Only re-runs if the ticker string changes

  return news;
}