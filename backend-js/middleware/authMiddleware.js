const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || 'dev-secret';

function optionalAuthenticate(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return next();
    const parts = auth.split(' ');
    if (parts.length !== 2) return next();
    const scheme = parts[0];
    const token = parts[1];
    if (!/^Bearer$/i.test(scheme)) return next();
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
    } catch (err) {
        // ignore invalid token for optional auth
    }
    return next();
}

function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: 'Missing authorization header' });
    const parts = auth.split(' ');
    if (parts.length !== 2) return res.status(401).json({ message: 'Invalid authorization header' });
    const token = parts[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

module.exports = { optionalAuthenticate, requireAuth };
