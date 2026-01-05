/** authMiddleware.js
 *  Middleware to authenticate requests using JWT tokens.
 *  Verifies the token and attaches user info to the request object.
 */
const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  const payload = {
    userId: user._id,
    userName: user.username,
    role: user.role,
  };
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT_SECRET_KEY is not set. Set JWT_SECRET_KEY in backend-node/.env or project root .env');
  }
  return jwt.sign(payload, secret, {
    expiresIn: "7d",
    subject: user._id.toString(),
  });
};

// Require valid JWT, attach user fields, or fail
const requireAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // DEBUG: Log this to see what is inside your token
      // console.log("Decoded Token:", decoded);

    req.userId = decoded.userId || decoded.sub;
    req.userName = decoded.userName || decoded.username || "Unknown";
    req.userRole = decoded.role || "user";
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid or expired token." });
  }
};

const authorize = (allowedRoles = []) => {
    return (req, res, next) => {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({ success: false, error: "Access denied. No token provided." });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            
            // 1. Attach user data to the request object
            req.userId = decoded.userId;
            req.userName = decoded.userName;
            req.userRole = decoded.role; // This must be in your JWT payload



            // 2. Role Check Logic
            if (allowedRoles.length > 0 && !allowedRoles.includes(req.userRole)) {
                console.warn(`[AUTH] Unauthorized access attempt by ${req.userName} (Role: ${req.userRole})`);
                return res.status(403).json({ 
                    success: false, 
                    error: `Access forbidden: Required roles [${allowedRoles.join(', ')}]` 
                });
            }

            next();
        } catch (err) {
            return res.status(403).json({ success: false, error: "Invalid or expired token." });
        }
    };
};

module.exports = {
  generateToken,
  requireAuth,
  authorize
};
