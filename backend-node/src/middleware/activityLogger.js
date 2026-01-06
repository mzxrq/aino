const jwt = require('jsonwebtoken');
const LogsService = require('../modules/activity-log/activity-log.service');

// Middleware: log successful non-GET CRUD operations to activity logs
module.exports = async function activityLogger(req, res, next) {
  try {
    // Skip safe methods
    if (!req || !req.method) return next();
    const method = String(req.method || '').toUpperCase();
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next();

    // Avoid logging activity-log management endpoints to prevent recursion
    if (req.path && req.path.startsWith('/node/logs')) return next();

    // Parse token if present to extract actor info (do not enforce)
    // Build actor info from JWT when available, but allow fallbacks to already-attached
    // request properties (e.g. set by other auth middleware) so actor.id isn't lost.
    let actor = { id: null, name: null, role: null };
    try {
      const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
      const token = auth && String(auth).split(' ')[1];
      if (token && process.env.JWT_SECRET_KEY) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY) || {};

        // Accept many possible claim names and coerce to string when possible
        const maybeId = decoded.userId || decoded.sub || decoded.id || decoded._id || decoded.uid || null;
        if (maybeId !== null && typeof maybeId !== 'undefined') {
          try { actor.id = String(maybeId); } catch (e) { actor.id = maybeId; }
        }

        actor.name = decoded.userName || decoded.username || decoded.name || actor.name;
        actor.role = decoded.role || decoded.roles || actor.role;
      }
    } catch (_e) {
      // ignore token errors for logging
    }

    // If JWT didn't provide an id/role/name, prefer values attached by upstream auth middleware
    try {
      if (!actor.id && req.userId) actor.id = String(req.userId);
      if (!actor.name && req.userName) actor.name = String(req.userName);
      if (!actor.role && req.userRole) actor.role = String(req.userRole);
    } catch (_e) { /* ignore */ }

    // Wait for response finish to record only successful operations
    res.on('finish', async () => {
      try {
        if (!res || typeof res.statusCode !== 'number') return;
        const status = res.statusCode;
        if (status < 200 || status >= 400) return; // only log successful responses

        // Map HTTP method to actionType
        const ACTION_MAP = { POST: 'Create', PUT: 'Update', PATCH: 'Update', DELETE: 'Delete' };
        const actionType = ACTION_MAP[method] || method;

        // Attempt to infer collection name from multiple sources:
        // 1) explicit query param `collection`
        // 2) mounted router base (`req.baseUrl`) + path (`req.path`)
        // 3) originalUrl or url
        // fallback: 'unknown'
        let collectionName = 'unknown';
        try {
          if (req.query && req.query.collection) {
            collectionName = String(req.query.collection);
          } else {
            const base = req.baseUrl || '';
            const path = req.path || req.url || req.originalUrl || '';
            const full = String(base + path);
            // try /node/<collection>
            let m = full.match(/\/node\/([^\/\?]+)/);
            if (!m) {
              // also try originalUrl alone
              const orig = String(req.originalUrl || '');
              m = orig.match(/\/node\/([^\/\?]+)/);
            }
            if (m && m[1]) collectionName = decodeURIComponent(m[1]);
            else {
              // last-resort: look for first path segment after leading '/'
              const parts = full.split('/').filter(Boolean);
              if (parts.length > 0) collectionName = parts[0];
            }
          }
        } catch (_e) { /* ignore */ }

        // Target identifier: prefer route param id or body id/_id, else guess last path segment if looks like id
        let targetIdentifier = '';
        try {
          if (req.params && (req.params.id || req.params._id)) targetIdentifier = req.params.id || req.params._id;
          else if (req.body && (req.body.id || req.body._id)) targetIdentifier = req.body.id || req.body._id;
          else {
            const parts = String(req.path || '').split('/').filter(Boolean);
            const last = parts[parts.length - 1];
            if (last && /^[0-9a-fA-F]{8,24}$/.test(last)) targetIdentifier = last;
          }
        } catch (_e) { /* ignore */ }

        // Meta: include top-level body keys for context (limit to 20)
        const meta = {};
        try {
          if (req.body && typeof req.body === 'object') {
            meta.fields = Object.keys(req.body).slice(0, 20);
          }
        } catch (_e) { /* ignore */ }

        // Allow anonymous logging only for user registration (create on `users`), otherwise require admin
        try {
          const actorIdPresent = actor && actor.id;
          const isAdmin = actor && actor.role && String(actor.role).toLowerCase() === 'admin';
          const isRegistration = String(collectionName || '').toLowerCase() === 'users' && String(actionType || '').toLowerCase() === 'create';
          if (!actorIdPresent && !isRegistration) return; // drop anonymous unless registration
          if (!isAdmin && !isRegistration) return; // only persist admin actions unless registration
        } catch (_e) { /* ignore */ }

        // Build log payload
        const payload = {
          actionType,
          collectionName,
          targetIdentifier: String(targetIdentifier || ''),
          meta,
        };

        // Create log entry via LogsService
        try {
          await LogsService.createLog({ body: payload, userId: actor.id, userName: actor.name, role: actor.role });
        } catch (err) {
          console.warn('Activity logger failed to create log:', err && err.message ? err.message : err);
        }
      } catch (err) {
        console.warn('Activity logger error:', err && err.message ? err.message : err);
      }
    });
  } catch (err) {
    // swallow middleware errors
    console.warn('activityLogger middleware init error:', err && err.message ? err.message : err);
  }

  return next();
};
