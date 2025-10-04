// src/controllers/password.controller.js
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OtpToken = require('../models/OtpToken');
const { generateNumericOtp } = require('../utils/generateOtp');
const { sendOtpEmail } = require('../utils/mailer');

const OTP_EXP_MINUTES = Number(process.env.OTP_EXP_MINUTES || 10);
const OTP_LENGTH = Number(process.env.OTP_LENGTH || 6);
const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS || 5);

// Create or replace OTP for an email
async function createOrReplaceOtp(email, otp) {
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otp, salt);
  const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);

  await OtpToken.deleteMany({ email });
  await OtpToken.create({ email, otpHash, expiresAt, attempts: 0 });
}

// POST /api/v1/auth/forgot-password
// Always responds {ok:true} to avoid user enumeration
async function forgotPassword(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'Email is required' });

    const user = await User.findOne({ email }).lean();

    // Always behave as success, even if user not found
    const otp = generateNumericOtp(OTP_LENGTH);
    if (user) {
      await createOrReplaceOtp(email, otp);
      await sendOtpEmail(email, otp);
    } else {
      await new Promise(r => setTimeout(r, 250));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(500).json({ ok: false, error: 'Could not send OTP' });
  }
}

// POST /api/v1/auth/verify-otp
async function verifyOtp(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    if (!email || !otp) return res.status(400).json({ ok: false, error: 'Email and OTP are required' });

    const token = await OtpToken.findOne({ email });
    if (!token) return res.status(400).json({ ok: false, error: 'OTP not found or expired' });

    if (token.attempts >= MAX_OTP_ATTEMPTS) {
      await OtpToken.deleteOne({ _id: token._id });
      return res.status(429).json({ ok: false, error: 'Too many attempts. Request a new OTP.' });
    }

    const ok = await bcrypt.compare(otp, token.otpHash);
    if (!ok) {
      token.attempts += 1;
      await token.save();
      return res.status(400).json({ ok: false, error: 'Invalid OTP' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('verifyOtp error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/v1/auth/reset-password
async function resetPassword(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Email, OTP and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ ok: false, error: 'User not found' });

    const token = await OtpToken.findOne({ email });
    if (!token) return res.status(400).json({ ok: false, error: 'OTP not found or expired' });

    if (token.attempts >= MAX_OTP_ATTEMPTS) {
      await OtpToken.deleteOne({ _id: token._id });
      return res.status(429).json({ ok: false, error: 'Too many attempts. Request a new OTP.' });
    }

    const ok = await bcrypt.compare(otp, token.otpHash);
    if (!ok) {
      token.attempts += 1;
      await token.save();
      return res.status(400).json({ ok: false, error: 'Invalid OTP' });
    }

    // OTP ok -> update password (User schema pre-save hook hashes it)
    user.password = newPassword;
    await user.save();

    // consume OTP
    await OtpToken.deleteOne({ _id: token._id });

    return res.json({ ok: true });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = {
  forgotPassword,
  verifyOtp,
  resetPassword
};
