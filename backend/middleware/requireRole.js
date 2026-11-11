/**
 * Role-based authorization — additive companion to middleware/auth.js.
 *
 * auth.js already verifies the JWT and sets req.user = { id, email, role }
 * (role is signed into the token at login by routes/auth.js). This middleware
 * only reads that role; it does not change how authentication works, and it is
 * applied ONLY to new endpoints (e.g. investigation outcomes). Existing routes
 * keep their current "any authenticated user" behaviour.
 *
 * Usage:  router.post('/x', auth, requireRole(ROLES.INVESTIGATION), handler)
 *
 * Note: the role comes from the token, so a role change made on the Users page
 * takes effect at the user's next login (tokens expire per JWT_EXPIRES_IN).
 */

// Role names exactly as stored in routes/users.js.
const ADMIN        = 'Admin';
const INVESTIGATOR = 'Investigator';

const ROLES = Object.freeze({
  ADMIN,
  INVESTIGATOR,
  ANALYST:  'Analyst',
  REVIEWER: 'Reviewer',
  // Who may record investigation outcomes (Confirmed Fraud / Legitimate / Requires Further Investigation).
  INVESTIGATION: Object.freeze([ADMIN, INVESTIGATOR]),
});

const requireRole = (...allowed) => {
  const permitted = allowed.flat();
  return (req, res, next) => {
    // Must run after auth.js; a missing user means the route was misconfigured.
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }
    if (!permitted.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `This action requires one of the roles: ${permitted.join(', ')}`,
      });
    }
    next();
  };
};

module.exports = requireRole;
module.exports.ROLES = ROLES;
