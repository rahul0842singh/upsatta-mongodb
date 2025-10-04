const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { registerSchema, loginSchema } = require('../validators/auth.schema');

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,             // 10 attempts/min/IP
  standardHeaders: true,
  legacyHeaders: false
});

function signToken(user) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name
  };
  const opts = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
  return jwt.sign(payload, process.env.JWT_SECRET, opts);
}

function cookieOpts() {
  const isProd = process.env.NODE_ENV === 'production';
  const secure = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true' || isProd;
  const sameSite = process.env.COOKIE_SAME_SITE || (secure ? 'None' : 'Lax');

  return {
    httpOnly: true,
    secure,
    sameSite,          // 'Lax' | 'Strict' | 'None'
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };
}

// POST /api/v1/auth/register
async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }
  const { name, email, password } = parsed.data;

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ ok: false, error: 'Email already in use' });

  const user = await User.create({ name, email, password });

  const token = signToken(user);
  res.cookie('token', token, cookieOpts());
  res.status(201).json({
    ok: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    }
  });
}

// POST /api/v1/auth/login
const login = [
  loginLimiter,
  async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({ email, isActive: true }).select('+password');
    if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    const token = signToken(user);
    res.cookie('token', token, cookieOpts());
    res.json({
      ok: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      }
    });
  }
];

// GET /api/v1/auth/me
async function me(req, res) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  res.json({
    ok: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }
  });
}

// POST /api/v1/auth/logout
function logout(_req, res) {
  res.clearCookie('token', { ...cookieOpts(), maxAge: 0 });
  res.json({ ok: true, data: { message: 'Logged out' } });
}

/**
 * POST /api/v1/auth/change-profile
 * Body:
 *  {
 *    currentPassword?: string,    // required only if changing password
 *    newEmail?: string,
 *    newName?: string,
 *    newPassword?: string
 *  }
 * Auth required. If newPassword is present, verify currentPassword.
 * If only email/name provided, allow without currentPassword.
 */
async function changeProfile(req, res) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const { currentPassword, newEmail, newName, newPassword } = req.body || {};

  if (
    newEmail === undefined &&
    newName === undefined &&
    newPassword === undefined
  ) {
    return res.status(400).json({ ok: false, error: 'Nothing to update' });
  }

  // load user, include password only if we may need it
  const user = await User.findById(req.user.id).select(
    newPassword ? '+password' : undefined
  );
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  // If changing password, require currentPassword and verify
  if (newPassword) {
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ ok: false, error: 'currentPassword is required to change password' });
    }
    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid current password' });
    user.password = newPassword; // hashed by pre-save hook
  }

  // Change email (unique check)
  if (typeof newEmail === 'string' && newEmail && newEmail !== user.email) {
    const exists = await User.findOne({ email: newEmail });
    if (exists) return res.status(409).json({ ok: false, error: 'Email already in use' });
    user.email = newEmail;
  }

  // Change name
  if (typeof newName === 'string' && newName) {
    user.name = newName;
  }

  await user.save();

  // re-issue a fresh token (email/name may have changed)
  const token = signToken(user);
  res.cookie('token', token, cookieOpts());

  res.json({
    ok: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    }
  });
}

module.exports = { register, login, me, logout, changeProfile };
