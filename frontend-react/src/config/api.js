// Central API base URL for frontend requests.
// Prefer Vite env var `VITE_NODE_API_URL` (new), fallback to `VITE_API_URL` for compatibility.
const API_BASE = import.meta.env.VITE_NODE_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:5050';

export default API_BASE
