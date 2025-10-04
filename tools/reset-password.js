// tools/reset-password.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

(async () => {
  try {
    const email = process.argv[2];
    const newPass = process.argv[3] || 'Secret123';
    if (!email) throw new Error('Usage: node tools/reset-password.js <email> [newPassword]');

    await mongoose.connect(process.env.MONGODB_URI);

    const hash = await bcrypt.hash(newPass, 12);
    const res = await User.updateOne(
      { email: email.toLowerCase().trim() },
      { $set: { passwordHash: hash } }
    );

    console.log('Result:', res);
  } catch (e) {
    console.error('ERROR:', e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
