/** roleMiddleware.js
 *  Middleware to check user roles for access control.
 */

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. Get user role from request (set by authMiddleware)
    // Check Role of the user making the request
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Insufficient permissions.",
      });
    }

    // 2. User has required role, proceed to next middleware/controller
    next();
  };
};

module.exports = { authorize };
