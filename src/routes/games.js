// src/routes/games.js
const { Router } = require('express');
const {
  listGames,
  getGame,
  createGame,
  updateGame,
  deleteGame,
  bulkUpsertGames,
} = require('../controllers/games.controller');

const router = Router();

/**
 * PUBLIC READ
 */
router.get('/', listGames);
router.get('/:code', getGame);

/**
 * PUBLIC WRITE (made simple — no auth)
 * NOTE: define fixed paths BEFORE param routes to avoid collisions
 */
router.post('/bulk', bulkUpsertGames); // bulk upsert
router.post('/', createGame);          // create
router.put('/:code', updateGame);      // update
router.delete('/:code', deleteGame);   // delete

module.exports = router;
