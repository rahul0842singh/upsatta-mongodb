// src/utils/indexes.js
const Game = require('../models/Game');

async function fixGameIndexes() {
  await Game.init(); // ensure model & schema indexes are known

  const indexes = await Game.collection.indexes();
  const toDrop = indexes.filter(i => {
    const key = i.key || {};
    // exact match on { orderIndex: 1 }
    return Object.keys(key).length === 1 && key.orderIndex === 1;
  });

  for (const idx of toDrop) {
    // Be noisy so we know what we’re removing
    console.warn(`Dropping index "${idx.name}" on orderIndex (unique=${!!idx.unique}, partial=${!!idx.partialFilterExpression})...`);
    try {
      await Game.collection.dropIndex(idx.name);
    } catch (err) {
      // If it was already gone in a race, keep going
      console.warn(`Drop failed (ignored): ${err.message}`);
    }
  }

  // Recreate the canonical non-unique index with our explicit name
  await Game.collection.createIndex(
    { orderIndex: 1 },
    { name: 'orderIndex_nonunique', background: true }
  );

  console.log('Ensured NON-UNIQUE orderIndex index (name: orderIndex_nonunique)');
}

module.exports = { fixGameIndexes };
