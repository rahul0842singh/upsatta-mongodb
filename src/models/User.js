const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, unique: true, required: true },
    role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'viewer' },

    // Store ONLY the hash. Never store raw passwords.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

// Instance method to compare a plaintext password with the hash
UserSchema.methods.comparePassword = function comparePassword(plain) {
  // passwordHash may be deselected; ensure it's available
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);
