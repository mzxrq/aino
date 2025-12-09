/**
 * isAdminMiddleware.js
 * Checks if the authenticated user has the 'admin' role.
 * Requires that a previous middleware (e.g., requireAuth) has attached
 * the user object or role information to req.
 */
exports.requireAdmin = (req, res, next) => {
    // 1. Check if user information exists (from previous auth middleware)
    // Assuming the user object is stored at req.user after JWT verification
    const user = req.user; 

    if (!user) {
        // This should theoretically be caught by requireAuth first, 
        // but it's a good safety check.
        return res.status(401).json({ error: "Unauthorized: Missing authentication context." });
    }

    // 2. Check the user's role
    // Check for a specific role string, adjusting if you use an array of roles.
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    if (isAdmin) {
        // User is authorized, proceed to the next handler
        next();
    } else {
        // User is authenticated but does not have the necessary role
        return res.status(403).json({ 
            error: "Forbidden: Access denied. Administrator privileges required." 
        });
    }
};