// src/routes/results.js
const { Router } = require('express');

const {
  createResult,          // POST /timewise (upsert one)
  getTimewise,           // GET /timewise?dateStr=YYYY-MM-DD
  getSnapshot,           // GET /snapshot
  getMonthlyChart,       // GET /monthly
  // deleteTimewise may not exist in your controller yet
  deleteTimewise,
} = require('../controllers/results.controller');

// OPTIONAL: If you have a games controller, we’ll reuse it.
// If it’s missing, we’ll fallback to [].
let getGamesHandler = null;
try {
  // Expecting something like: module.exports = { getGames: (req,res)=>{...} }
  // If your export name differs, change 'getGames' below.
  // eslint-disable-next-line global-require
  const gamesCtrl = require('../controllers/games.controller');
  getGamesHandler = gamesCtrl && (gamesCtrl.getGames || gamesCtrl.list || gamesCtrl.index);
} catch (e) {
  // no-op; we’ll warn at runtime if games handler is missing
}

const router = Router();

/* ------------------------- Utilities for aggregator ------------------------ */

/** Minimal IST date helpers (YYYY-MM-DD) */
function pad(n) { return String(n).padStart(2, '0'); }

function toISTParts(date) {
  // Convert current time to IST by offsetting from UTC
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 60 * 60000);
  return {
    y: ist.getFullYear(),
    m: ist.getMonth() + 1,
    d: ist.getDate(),
  };
}

/** Yesterday of a given YYYY-MM-DD, computed safely */
function yesterdayOf(yyyy_mm_dd) {
  const [Y, M, D] = yyyy_mm_dd.split('-').map((x) => parseInt(x, 10));
  // Use UTC spine to avoid DST issues; we only care about calendar date
  const u = new Date(Date.UTC(Y, M - 1, D));
  u.setUTCDate(u.getUTCDate() - 1);
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`;
}

/**
 * Run an Express handler (req,res,next) in-process and capture its JSON.
 * This lets us reuse your existing controllers without duplicating DB logic.
 */
function runHandler(handler, { method = 'GET', query = {}, body = {}, headers = {}, params = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, query, body, headers, params };

    // Capture status + json body
    let statusCode = 200;
    let sent = false;

    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { sent = true; resolve({ status: statusCode, body: payload }); },
      send(payload) { sent = true; resolve({ status: statusCode, body: payload }); },
      set(field, val) { /* allow controller to set headers; we ignore here */ return this; },
    };

    const next = (err) => {
      if (sent) return;
      if (err) reject(err);
      else resolve({ status: statusCode, body: undefined });
    };

    try {
      const maybePromise = handler(req, res, next);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

/** Compute latest (last non-XX/--) slot per game code from timewise rows */
function computeLastSlotByGame(rows, codes) {
  const latest = {};
  codes.forEach((c) => { latest[c] = null; });
  (rows || []).forEach((row) => {
    codes.forEach((code) => {
      const v = (row.values && row.values[code]) || 'XX';
      if (v !== 'XX' && v !== '--') latest[code] = row.slotMin;
    });
  });
  return latest;
}

/* ------------------------------ Aggregator API ----------------------------- */
/**
 * GET /api/v1/results/home?dateStr=YYYY-MM-DD
 *
 * Returns:
 * {
 *   ok: true,
 *   data: {
 *     dateStr,
 *     games: GameDoc[],
 *     timewise: { yesterday: TimewiseRow[], today: TimewiseRow[] },
 *     snapshot: { yesterday: Record<string,string>, today: Record<string,string> },
 *     latestTime: { yesterday: Record<string,number|null>, today: Record<string,number|null> },
 *     monthly: Array<{dateStr:string} & Record<string,string>>
 *   }
 * }
 */
router.get('/home', async (req, res, next) => {
  try {
    let { dateStr } = req.query;

    // If no dateStr provided, default to "today in IST"
    if (!dateStr) {
      const { y, m, d } = toISTParts(new Date());
      dateStr = `${y}-${pad(m)}-${pad(d)}`;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
      return res.status(400).json({ ok: false, error: 'Provide ?dateStr=YYYY-MM-DD (IST)' });
    }

    const yester = yesterdayOf(String(dateStr));
    const [Y, M] = String(dateStr).split('-').map((n) => parseInt(n, 10));

    // 1) Games
    let games = [];
    if (typeof getGamesHandler === 'function') {
      const g = await runHandler(getGamesHandler, { method: 'GET' });
      // Try common shapes: { ok, data:{ games } } or { games } or just array
      if (g && g.body) {
        if (Array.isArray(g.body)) games = g.body;
        else if (g.body.data && Array.isArray(g.body.data.games)) games = g.body.data.games;
        else if (Array.isArray(g.body.games)) games = g.body.games;
      }
    } else {
      console.warn('[results.routes] games.controller not found; returning empty games array in /home.');
    }

    // 2) Timewise yesterday & today (reuse your existing handlers)
    const [twY, twT] = await Promise.all([
      runHandler(getTimewise, { method: 'GET', query: { dateStr: yester } }),
      runHandler(getTimewise, { method: 'GET', query: { dateStr } }),
    ]);

    const twRowsY = (twY.body && twY.body.data && Array.isArray(twY.body.data.rows))
      ? twY.body.data.rows
      : (twY.body && Array.isArray(twY.body.rows) ? twY.body.rows : []);

    const twRowsT = (twT.body && twT.body.data && Array.isArray(twT.body.data.rows))
      ? twT.body.data.rows
      : (twT.body && Array.isArray(twT.body.rows) ? twT.body.rows : []);

    // 3) Snapshots at 23:59
    const [ssY, ssT] = await Promise.all([
      runHandler(getSnapshot, { method: 'GET', query: { dateStr: yester, time: '23:59' } }),
      runHandler(getSnapshot, { method: 'GET', query: { dateStr, time: '23:59' } }),
    ]);

    const snapshotY = (ssY.body && ssY.body.data && ssY.body.data.values) || (ssY.body && ssY.body.values) || {};
    const snapshotT = (ssT.body && ssT.body.data && ssT.body.data.values) || (ssT.body && ssT.body.values) || {};

    // 4) Monthly chart for YYYY-MM
    const monthlyRes = await runHandler(getMonthlyChart, { method: 'GET', query: { year: String(Y), month: String(M) } });
    const monthlyRows = (monthlyRes.body && monthlyRes.body.data && Array.isArray(monthlyRes.body.data.rows))
      ? monthlyRes.body.data.rows
      : (monthlyRes.body && Array.isArray(monthlyRes.body.rows) ? monthlyRes.body.rows : []);

    // 5) Compute latest slot per game (from timewise rows)
    const codes = games.map((g) => g.code);
    const latestYesterday = computeLastSlotByGame(twRowsY, codes);
    const latestToday = computeLastSlotByGame(twRowsT, codes);

    // 6) Sort games by orderIndex like your frontend
    games.sort((a, b) => ((a.orderIndex ?? 999) - (b.orderIndex ?? 999)));

    // 7) Respond with cache headers
    res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

    return res.json({
      ok: true,
      data: {
        dateStr,
        games,
        timewise: { yesterday: twRowsY, today: twRowsT },
        snapshot: { yesterday: snapshotY, today: snapshotT },
        latestTime: { yesterday: latestYesterday, today: latestToday },
        monthly: monthlyRows,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------- Old routes -------------------------------- */

/** TIMEWISE (per date) */
router.get('/timewise', getTimewise);

// Upsert — support '/timewise' (current) and '/' (legacy)
router.post('/timewise', createResult);
router.post('/', createResult);

// Delete one — only register if the controller exists
if (typeof deleteTimewise === 'function') {
  router.delete('/timewise/:id', deleteTimewise);
} else {
  console.warn('[results.routes] deleteTimewise not found; DELETE /timewise/:id will not be registered.');
}

/** SNAPSHOT & MONTHLY */
router.get('/snapshot', getSnapshot);
router.get('/monthly', getMonthlyChart);

module.exports = router;
