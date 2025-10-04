// src/models/OtpToken.js
const mongoose = require('mongoose');

const OtpTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },   // bcrypt-hashed OTP
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// TTL index: auto-remove at expiresAt
OtpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Avoid OverwriteModelError on hot reloads / nodemon
module.exports = mongoose.models.OtpToken || mongoose.model('OtpToken', OtpTokenSchema);
