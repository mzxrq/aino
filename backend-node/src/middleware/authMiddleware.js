const jwt = require('jsonwebtoken');
require('dotenv').config();

const { getUserById } = require('../services/usersService'); // adjust path

const JWT_SECRET =
  process.env.JWT_SECRET_KEY ||
  process.env.JWT_SECRET ||
  'dev-secret';

/**
 * Extract userId from JWT but DO NOT fail.
 */
function optionalAuthenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return next();

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.userId =
      decoded.sub ||
      decoded.id ||
      decoded._id ||
      decoded.userId ||
      null;
      
  } catch {
    // ignore errors silently
  }

  return next();
}

/**
 * Fully authenticated: requires JWT + loads full user from DB.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header)
    return res.status(401).json({ error: 'Missing Authorization header' });

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token)
    return res.status(401).json({ error: 'Authorization format: Bearer <token>' });

  // --- STEP 1: Verify Token ---
  let userId;
  let decoded;

  try {
    decoded = jwt.verify(token, JWT_SECRET);

    userId =
      decoded.sub ||
      decoded.id ||
      decoded._id ||
      decoded.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Token contains no user ID (sub, id, _id)' });
    }

    req.userId = String(userId);

  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // --- STEP 2: Load User From DB ---
  try {
    const user = await getUserById(userId);

    if (!user)
      return res.status(404).json({ error: 'User not found' });

    // Attach full user to req for downstream middleware
    req.user = user;

    return next();

  } catch (err) {
    console.error('Auth DB error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

module.exports = {
  optionalAuthenticate,
  requireAuth,
};

// Admin check: ensure authenticated and has admin role
async function requireAdmin(req, res, next) {
  try {
    await requireAuth(req, res, async () => {
      const user = req.user;
      if (!user) return res.status(403).json({ error: 'Forbidden' });
      const role = (user.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'superadmin') return res.status(403).json({ error: 'Admin access required' });
      return next();
    });
  } catch (err) {
    console.error('requireAdmin error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports.requireAdmin = requireAdmin;
