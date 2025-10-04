const jwt = require('jsonwebtoken');

/**
 * Read token from:
 *  - HTTP-only cookie "token"
 *  - OR Authorization: Bearer <token>
 */
function extractToken(req) {
  const fromCookie = req.cookies?.token;
  if (fromCookie) return fromCookie;
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) return token;
  return null;
}

function authJwt(required = true) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      return required
        ? res.status(401).json({ ok: false, error: 'Unauthorized' })
        : next();
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
      next();
    } catch (err) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: 'Forbidden' });
    next();
  };
}

module.exports = { authJwt, requireRole };
