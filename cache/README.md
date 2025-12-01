Local cache folder

This folder is intended as a simple place to store optional server-side file cache artifacts if you prefer file-based caching instead of MongoDB. Currently the backend uses MongoDB-based cache, and the frontend uses localStorage caching.

How to use a file cache (optional):
- You can create JSON files named with the pattern: `chart__<TICKER>__<PERIOD>__<INTERVAL>.json`.
- The server would need a tiny plugin to read/write these files and apply TTL logic. That is NOT implemented by default to avoid surprising behavior.

Notes:
- The frontend implements a localStorage cache (keyed by ticker+period+interval) and a "Refresh" button to force re-fetching from the backend.
- If you want me to add a file-based server fallback (reads/writes from this folder when MongoDB is not available), tell me and I will implement it.