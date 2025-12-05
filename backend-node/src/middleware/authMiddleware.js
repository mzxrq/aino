/**
 * authMiddleware.js
 * -----------------
 * Handles JWT-based authentication for Express routes.
 * 
 * Exports:
 *  - optionalAuthenticate: Extracts and verifies JWT if present, but allows requests without a token.
 *  - requireAuth: Requires a valid JWT to access the route; returns 401 if missing or invalid.
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || 'dev-secret';

/**
 * Optional authentication middleware.
 * If a valid JWT is provided in the Authorization header, sets `req.userId`.
 * Otherwise, allows the request to continue without authentication.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function optionalAuthenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const [scheme, token] = authHeader.split(' ');
    if (!/^Bearer$/i.test(scheme) || !token) return next();

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
    } catch {
        // Ignore invalid tokens for optional authentication
    }

    next();
}

/**
 * Required authentication middleware.
 * Verifies JWT from the Authorization header.
 * Sets `req.userId` if valid; otherwise responds with 401 Unauthorized.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Missing authorization header' });

    const [scheme, token] = authHeader.split(' ');
    if (!/^Bearer$/i.test(scheme) || !token) {
        return res.status(401).json({ message: 'Invalid authorization header' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

module.exports = { optionalAuthenticate, requireAuth };
