// src/controllers/results.controller.js
const Game = require("../models/Game");
const Result = require("../models/Result");
const {
  createResultSchema,
  monthlyChartQuerySchema,
  snapshotQuerySchema,
  timewiseQuerySchema
} = require("../validators/results.schema");
const { hhmmToMinutes } = require("../utils/time");

/**
 * Treat missing isActive as active (works with/without the field).
 */
const activeFilter = { isActive: { $ne: false } };

/**
 * POST /api/v1/results/timewise
 * Body: { gameCode, dateStr, time, value, note? }
 * Upsert a single timewise result for a game/date/slot.
 */
async function createResult(req, res) {
  const parsed = createResultSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { gameCode, dateStr, time, value, note } = parsed.data;

  const game = await Game.findOne({ code: gameCode.toUpperCase(), ...activeFilter });
  if (!game) {
    return res.status(404).json({ ok: false, error: "Game not found" });
  }

  let slotMin;
  try {
    slotMin = hhmmToMinutes(time);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  try {
    const doc = await Result.findOneAndUpdate(
      { game: game._id, dateStr, slotMin },
      { $set: { value, note } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ ok: true, data: doc });
  } catch (err) {
    console.error("createResult error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

/**
 * GET /api/v1/results/timewise?dateStr=YYYY-MM-DD
 * Returns:
 *  - games: full game docs (ordered)
 *  - rows: slot matrix (slotMin + values by code, 'XX' for empty)
 *  - items: latest (_id, time, value) per game for convenience
 */
async function getTimewise(req, res) {
  const parsed = timewiseQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { dateStr } = parsed.data;

  try {
    const games = await Game.find(activeFilter)
      .sort({ orderIndex: 1 })
      .lean();
    const gameIds = games.map((g) => g._id);

    // All results for that date (ascending by slotMin)
    const results = await Result.find({ dateStr, game: { $in: gameIds } })
      .sort({ slotMin: 1 })
      .lean();

    // Build slot matrix (existing behavior)
    const bySlot = {};
    for (const r of results) {
      if (!bySlot[r.slotMin]) bySlot[r.slotMin] = { slotMin: r.slotMin, values: {} };
      const g = games.find((gg) => String(gg._id) === String(r.game));
      if (g) bySlot[r.slotMin].values[g.code] = r.value;
    }
    const rows = Object.values(bySlot).map((row) => {
      const values = {};
      for (const g of games) values[g.code] = row.values[g.code] || "XX";
      return { time: row.slotMin, slotMin: row.slotMin, values };
    });

    // Latest item per game including _id/time/value for delete/edit
    const latestByCode = new Map(); // code -> { _id, slotMin, value }
    for (const r of results) {
      const g = games.find((gg) => String(gg._id) === String(r.game));
      if (!g) continue;
      const prev = latestByCode.get(g.code);
      if (!prev || r.slotMin >= prev.slotMin) {
        latestByCode.set(g.code, { _id: r._id, slotMin: r.slotMin, value: r.value });
      }
    }

    // items aligned to games order
    const items = games.map((g) => {
      const found = latestByCode.get(g.code);
      if (found) {
        // convert minutes -> "HH:MM AM/PM"
        const mins = found.slotMin;
        let h24 = Math.floor(mins / 60);
        const m = mins % 60;
        const ampm = h24 >= 12 ? "PM" : "AM";
        let h12 = h24 % 12; if (h12 === 0) h12 = 12;
        const mm = String(m).padStart(2, "0");
        const timeStr = `${h12}:${mm} ${ampm}`;

        return { _id: String(found._id), gameCode: g.code, time: timeStr, value: found.value };
      }
      // no prior value
      return { _id: null, gameCode: g.code, time: g.defaultTime || "", value: "" };
    });

    return res.json({ ok: true, data: { dateStr, games, rows, items } });
  } catch (err) {
    console.error("getTimewise error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

/**
 * GET /api/v1/results/snapshot?dateStr=YYYY-MM-DD&time=HH:MM AM/PM
 * Latest value per game up to the given time on that date.
 */
async function getSnapshot(req, res) {
  const parsed = snapshotQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { dateStr, time } = parsed.data;

  let slotMin;
  try {
    slotMin = hhmmToMinutes(time);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  try {
    const games = await Game.find(activeFilter).sort({ orderIndex: 1 }).lean();
    const gameIds = games.map((g) => g._id);

    const pipeline = [
      { $match: { dateStr, game: { $in: gameIds }, slotMin: { $lte: slotMin } } },
      { $sort: { slotMin: -1 } },
      { $group: { _id: "$game", doc: { $first: "$$ROOT" } } }
    ];

    const latestPerGame = await Result.aggregate(pipeline);
    const valuesByGame = {};
    for (const g of games) valuesByGame[g.code] = "XX";
    for (const x of latestPerGame) {
      const g = games.find((gg) => String(gg._id) === String(x._id));
      if (g) valuesByGame[g.code] = x.doc.value;
    }

    return res.json({ ok: true, data: { dateStr, time, values: valuesByGame } });
  } catch (err) {
    console.error("getSnapshot error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

/**
 * GET /api/v1/results/monthly?year=YYYY&month=M[1-12]&games[]=CODE...
 * Returns a row per day with latest value per game for that day.
 */
async function getMonthlyChart(req, res) {
  const parsed = monthlyChartQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const { year, month, games: gamesParam } = parsed.data;

  try {
    const query =
      gamesParam && gamesParam.length
        ? { code: { $in: gamesParam }, ...activeFilter }
        : { ...activeFilter };

    const games = await Game.find(query).sort({ orderIndex: 1 }).lean();

    const pad = (n) => String(n).padStart(2, "0");
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateStrs = Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);

    const agg = await Result.aggregate([
      { $match: { dateStr: { $in: dateStrs }, game: { $in: games.map((g) => g._id) } } },
      { $sort: { slotMin: -1 } },
      { $group: { _id: { dateStr: "$dateStr", game: "$game" }, last: { $first: "$$ROOT" } } }
    ]);

    const map = {};
    for (const d of dateStrs) map[d] = {};
    for (const g of games) for (const d of dateStrs) map[d][g.code] = "XX";

    for (const row of agg) {
      const dateStr = row._id.dateStr;
      const gameId = String(row._id.game);
      const g = games.find((gg) => String(gg._id) === gameId);
      if (g) map[dateStr][g.code] = row.last.value;
    }

    const rows = dateStrs.map((d) => ({ dateStr: d, ...map[d] }));
    return res.json({ ok: true, data: { year, month, games: games.map((g) => g.code), rows } });
  } catch (err) {
    console.error("getMonthlyChart error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

/**
 * DELETE /api/v1/results/timewise/:id
 * Deletes a single result document by its _id.
 */
async function deleteTimewise(req, res) {
  try {
    const { id } = req.params;
    const doc = await Result.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Result not found" });
    return res.json({ ok: true, data: { deletedId: id } });
  } catch (err) {
    console.error("deleteTimewise error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

module.exports = {
  createResult,
  getTimewise,
  getSnapshot,
  getMonthlyChart,
  deleteTimewise
};
