// src/models/Game.js
const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  defaultTime: { type: String, default: '' },
  orderIndex: { type: Number, min: 1, default: 999 }, // not unique
}, { timestamps: true });

// Give it an explicit, new name:
GameSchema.index(
  { orderIndex: 1 },
  { unique: false, name: 'orderIndex_nonunique', background: true }
);

module.exports = mongoose.model('Game', GameSchema);
