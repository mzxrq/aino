const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || 'dev-secret';

function optionalAuthenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const [scheme, token] = authHeader.split(' ');
    if (!/^Bearer$/i.test(scheme) || !token) return next();

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        req.userId =
            payload.sub ||
            payload.id ||
            payload._id ||
            payload.userId ||
            null;

    } catch {}

    next();
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Missing authorization header' });

    const [scheme, token] = authHeader.split(' ');
    if (!/^Bearer$/i.test(scheme) || !token)
        return res.status(401).json({ message: 'Invalid authorization header' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        req.userId =
            payload.sub ||
            payload.id ||
            payload._id ||
            payload.userId ||
            null;

        if (!req.userId) {
            return res.status(401).json({ message: 'Token missing user ID' });
        }

        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

module.exports = { optionalAuthenticate, requireAuth };
