const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(); // 'lax' | 'none' | 'strict'

// Helper to sign JWT
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Auth middleware (reads Bearer or cookie)
function auth(req, res, next) {
  try {
    const bearer = req.headers.authorization?.split(' ')[1];
    const token = bearer || req.cookies?.token;
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

// ---- Register ----
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Name, email, password are required' });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Optional: make the very first user an admin
    const usersCount = await User.countDocuments();
    const finalRole = usersCount === 0 ? 'admin' : (role || 'viewer');

    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      role: finalRole,
      passwordHash,
    });

    const token = signToken({ id: user._id.toString(), email: user.email, role: user.role });

    // Set cookie (cross-site friendly if you deploy FE/BE separately)
    res.cookie('token', token, {
      httpOnly: true,
      secure: COOKIE_SECURE,          // true for HTTPS production
      sameSite: COOKIE_SAMESITE,      // 'none' when cross-site + HTTPS
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });

    return res.json({
      ok: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      },
      token, // (optional) also return in body if you want SPA localStorage flows
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ---- Login ----
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required' });
    }

    // Need passwordHash -> use select('+passwordHash')
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const token = signToken({ id: user._id.toString(), email: user.email, role: user.role });

    res.cookie('token', token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });

    return res.json({
      ok: true,
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      },
      token, // optional
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ---- Logout ----
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/', secure: COOKIE_SECURE, sameSite: COOKIE_SAMESITE });
  return res.json({ ok: true });
});

// ---- Me ----
router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  return res.json({
    ok: true,
    data: { user: { id: user._id, name: user.name, email: user.email, role: user.role } },
  });
});

module.exports = router;
