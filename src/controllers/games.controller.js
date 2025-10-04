// src/controllers/games.controller.js
const Game = require('../models/Game');

// GET /api/v1/games
exports.listGames = async (req, res) => {
  const games = await Game.find().sort({ orderIndex: 1, name: 1 }).lean();
  res.json({ ok: true, data: { games } });
};

// GET /api/v1/games/:code
exports.getGame = async (req, res) => {
  const { code } = req.params;
  const game = await Game.findOne({ code: code.toUpperCase() }).lean();
  if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });
  res.json({ ok: true, data: { game } });
};

// POST /api/v1/games
// Create game; if orderIndex collides, shift other games down to make room.
exports.createGame = async (req, res) => {
  try {
    let { name, code, defaultTime = '', orderIndex } = req.body || {};
    if (!name || !code) {
      return res.status(400).json({ ok: false, error: 'name and code are required' });
    }

    code = String(code).toUpperCase();
    let idx = Number(orderIndex);

    if (!idx || idx < 1 || !Number.isFinite(idx)) {
      // auto-append to end
      const last = await Game.findOne().sort({ orderIndex: -1 }).lean();
      idx = last ? (Number(last.orderIndex) || 0) + 1 : 1;
    } else {
      // shift others if collision
      const existsAtIdx = await Game.exists({ orderIndex: idx });
      if (existsAtIdx) {
        await Game.updateMany({ orderIndex: { $gte: idx } }, { $inc: { orderIndex: 1 } });
      }
    }

    const game = await Game.create({ name, code, defaultTime, orderIndex: idx });
    res.json({ ok: true, data: { game } });
  } catch (err) {
    // Handle duplicate code nicely
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.code) {
      return res.status(409).json({ ok: false, error: 'Game code already exists' });
    }
    console.error('createGame error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
};

// PUT /api/v1/games/:code
// Update single game; if changing orderIndex and it collides, shift others.
exports.updateGame = async (req, res) => {
  try {
    const { code } = req.params;
    const { name, defaultTime, orderIndex, newCode } = req.body || {};
    const game = await Game.findOne({ code: code.toUpperCase() });
    if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });

    if (name !== undefined) game.name = name;
    if (defaultTime !== undefined) game.defaultTime = defaultTime;

    if (newCode !== undefined) {
      game.code = String(newCode).toUpperCase();
    }

    if (orderIndex !== undefined) {
      let idx = Number(orderIndex);
      if (!idx || idx < 1 || !Number.isFinite(idx)) {
        const last = await Game.findOne().sort({ orderIndex: -1 }).lean();
        idx = last ? (Number(last.orderIndex) || 0) + 1 : 1;
      }

      if (idx !== game.orderIndex) {
        // Make room if target idx already used (and not this same game)
        const exists = await Game.findOne({ orderIndex: idx, _id: { $ne: game._id } }).lean();
        if (exists) {
          await Game.updateMany({ orderIndex: { $gte: idx } }, { $inc: { orderIndex: 1 } });
        }
        game.orderIndex = idx;
      }
    }

    await game.save();
    res.json({ ok: true, data: { game } });
  } catch (err) {
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.code) {
      return res.status(409).json({ ok: false, error: 'Game code already exists' });
    }
    console.error('updateGame error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
};

// DELETE /api/v1/games/:code
exports.deleteGame = async (req, res) => {
  const { code } = req.params;
  const out = await Game.findOneAndDelete({ code: code.toUpperCase() }).lean();
  if (!out) return res.status(404).json({ ok: false, error: 'Game not found' });
  res.json({ ok: true, data: { deleted: out._id } });
};

// POST /api/v1/games/bulk
// Expects [{name, code, defaultTime, orderIndex}, ...]
// Uses same collision logic: will shift to make room when needed.
exports.bulkUpsertGames = async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const results = [];
  try {
    for (const raw of items) {
      let { name, code, defaultTime = '', orderIndex } = raw || {};
      if (!name || !code) continue;

      code = String(code).toUpperCase();
      let idx = Number(orderIndex);

      const existing = await Game.findOne({ code });
      if (existing) {
        // update existing
        existing.name = name;
        existing.defaultTime = defaultTime;

        if (idx && idx > 0 && idx !== existing.orderIndex) {
          const exists = await Game.findOne({ orderIndex: idx, _id: { $ne: existing._id } }).lean();
          if (exists) {
            await Game.updateMany({ orderIndex: { $gte: idx } }, { $inc: { orderIndex: 1 } });
          }
          existing.orderIndex = idx;
        }
        await existing.save();
        results.push({ code, action: 'updated' });
      } else {
        // create new
        if (!idx || idx < 1) {
          const last = await Game.findOne().sort({ orderIndex: -1 }).lean();
          idx = last ? (Number(last.orderIndex) || 0) + 1 : 1;
        } else {
          const exists = await Game.findOne({ orderIndex: idx }).lean();
          if (exists) {
            await Game.updateMany({ orderIndex: { $gte: idx } }, { $inc: { orderIndex: 1 } });
          }
        }
        await Game.create({ name, code, defaultTime, orderIndex: idx });
        results.push({ code, action: 'created' });
      }
    }

    res.json({ ok: true, data: { results } });
  } catch (err) {
    console.error('bulkUpsertGames error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
};
