require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectDB } = require('./db');
const { fixGameIndexes } = require('./utils/indexes');

const app = express();

// ⚙️ CORS Setup (same as before)
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// ✅ Existing Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/games', require('./routes/games'));
app.use('/api/v1/results', require('./routes/results'));

// ✅ New Payments Route
app.use('/api/v1/payments', require('./routes/paymentRoutes'));

// Health Route
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
const URI = process.env.MONGODB_URI;

(async () => {
  try {
    await connectDB(URI);
    await fixGameIndexes();
    app.listen(PORT, () => {
      console.log(`🚀 API listening on http://localhost:${PORT}`);
      console.log('CORS mode: origin=true (reflect, allow ALL origins)');
    });
  } catch (err) {
    console.error('💥 Startup aborted due to DB connection failure.', err);
    process.exit(1);
  }
})();

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
