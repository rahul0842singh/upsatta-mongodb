/**
 * Bulk import monthly results from a matrix-style CSV
 *
 * CSV header must look like:
 *   DATE,DSWR,FRBD,GZBD,GALI
 *   01,XX,23,88,13
 *   ...
 *
 * Usage:
 *   node src/seed/bulkImportFromMatrix.js 2025 08 ./data/august.csv
 */

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const mongoose = require("mongoose");
const Game = require("../models/Game");
const Result = require("../models/Result");

// ✅ Your MongoDB connection string (env wins, else fallback to your Atlas URI)
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://rah0987654321_db_user:hello123@cluster0.neebeft.mongodb.net/";

// ✅ Map CSV header codes → actual Game.code in your database
const CODE_ALIASES = {
  DSWR: "DISA", // DESAWAR
  FRBD: "FRDA", // FARIDABAD
  GZBD: "GZB",  // GHAZIABAD
  GALI: "GLI",  // GALI

  // Allow already-correct header forms (no-op)
  DISA: "DISA",
  FRDA: "FRDA",
  GZB:  "GZB",
  GLI:  "GLI",
};

// Fallback if a Game has no defaultTime set
const DEFAULT_TIME = "03:40 PM";

/**
 * Tolerant time parser → minutes since midnight
 * Accepts:
 *   - "HH:MM AM/PM"  (space optional: "03:40PM")
 *   - "HH:MM"        (24-hour: "15:40" or "03:40")
 *   - "HHMM" / "HHMMAM/PM" (e.g., "1540", "0340PM")
 */
function hhmmToMinutes(input) {
  if (!input) throw new Error(`Bad time string: "${input}"`);
  const s = String(input).trim().toUpperCase().replace(/\./g, "");

  // 1) HH:MM with optional AM/PM
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3]; // undefined → 24h
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Bad time string: "${input}"`);
    return h * 60 + min;
  }

  // 2) HHMM with optional AM/PM (e.g., 1540, 0340PM)
  m = s.match(/^(\d{1,2})(\d{2})(AM|PM)?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3];
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Bad time string: "${input}"`);
    return h * 60 + min;
  }

  throw new Error(`Bad time string: "${input}"`);
}

function toYYYYMMDD(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function ensureDB() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI, { autoIndex: true });
    console.log("✅ Connected to MongoDB");
  }
}

async function loadGames() {
  const games = await Game.find({}, { code: 1, name: 1, defaultTime: 1 });
  const byCode = new Map();
  for (const g of games) byCode.set(String(g.code).toUpperCase(), g);
  console.log("🎮 Games in DB:", Array.from(byCode.keys()).join(", "));
  return byCode;
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

/** Expand matrix rows into flat rows: { dateStr, headerCode, value } */
function expandToRows(rows, year, month, headerCodes) {
  const out = [];
  for (const r of rows) {
    const dayStr = String(r.DATE || "").trim();
    const day = parseInt(dayStr, 10);
    if (!day || day < 1 || day > 31) continue;

    const dateStr = toYYYYMMDD(year, month, day);
    for (const code of headerCodes) {
      const raw = r[code];
      const val = raw == null ? "" : String(raw).trim();
      if (!val || val === "XX") continue; // skip blanks/XX
      out.push({ dateStr, headerCode: code.toUpperCase(), value: val });
    }
  }
  return out;
}

(async () => {
  try {
    const [YEAR, MONTH, CSV] = process.argv.slice(2);
    if (!YEAR || !MONTH || !CSV) {
      console.error("Usage: node src/seed/bulkImportFromMatrix.js <YEAR> <MM> <csvPath>");
      process.exit(1);
    }

    const year = parseInt(YEAR, 10);
    const month = parseInt(MONTH, 10);
    const csvPath = path.resolve(CSV);
    if (!fs.existsSync(csvPath)) {
      console.error("❌ File not found:", csvPath);
      process.exit(1);
    }

    await ensureDB();
    const gameMap = await loadGames();

    const rows = readCsv(csvPath);
    if (!rows.length) {
      console.error("❌ CSV has no data rows.");
      process.exit(1);
    }

    const headerCodes = Object.keys(rows[0]).filter((k) => k !== "DATE");
    const expanded = expandToRows(rows, year, month, headerCodes);

    const ops = [];
    let skipped = 0;

    for (const row of expanded) {
      const mapped = CODE_ALIASES[row.headerCode] || row.headerCode;
      const game = gameMap.get(mapped);
      if (!game) {
        console.warn(`⚠️  No matching game in DB for header "${row.headerCode}" (mapped: "${mapped}")`);
        skipped++;
        continue;
      }

      const timeStr = (game.defaultTime && game.defaultTime.trim()) || DEFAULT_TIME;
      const slotMin = hhmmToMinutes(timeStr);

      ops.push({
        updateOne: {
          filter: { game: game._id, dateStr: row.dateStr, slotMin },
          update: {
            $set: { value: row.value, source: "bulk-matrix" },
            $setOnInsert: { game: game._id, dateStr: row.dateStr, slotMin },
          },
          upsert: true,
        },
      });
    }

    console.log(
      `📦 Prepared ${ops.length} upsert ops for ${year}-${String(month).padStart(2, "0")}, skipped ${skipped}.`
    );

    const CHUNK = 1000;
    let upserted = 0,
      modified = 0;

    for (let i = 0; i < ops.length; i += CHUNK) {
      const chunk = ops.slice(i, i + CHUNK);
      const res = await Result.bulkWrite(chunk, { ordered: false });
      upserted += res.nUpserted || 0;
      modified += res.nModified || 0;
      console.log(
        `Chunk ${Math.floor(i / CHUNK) + 1}: upserted ${res.nUpserted || 0}, modified ${res.nModified || 0}`
      );
    }

    console.log(`✅ Done. Upserted: ${upserted}, Modified: ${modified}, Skipped: ${skipped}`);
    await mongoose.connection.close();
  } catch (err) {
    console.error("❌ Import failed:", err);
    try {
      await mongoose.connection.close();
    } catch {}
    process.exit(1);
  }
})();
