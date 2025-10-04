// src/db.js
const mongoose = require('mongoose');

async function connectDB(uri) {
  if (!uri) throw new Error('MONGODB_URI is missing');
  // Fail fast instead of buffering forever
  mongoose.set('bufferCommands', false);
  // Optional (silence deprecation warnings)
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // 10s
      // tls is automatic for +srv; keep defaults
      // dbName may be in your URI already; if not, you can set it here
      // dbName: 'satta_king',
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err?.message || err);
    throw err; // let caller decide to exit
  }
}

module.exports = { connectDB };
