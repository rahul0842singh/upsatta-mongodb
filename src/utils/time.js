const ZONE_OFFSET_MIN = 330; // IST +05:30 (kept for clarity)

/**
 * Accept "HH:mm", "H:mm", "h:mm AM/PM", "hh:mm AM/PM"
 * Returns minutes from midnight (0..1439)
 */
function hhmmToMinutes(input) {
  const s = String(input).trim().toUpperCase();
  const ampm = s.endsWith("AM") || s.endsWith("PM");

  let hh = 0, mm = 0;

  if (ampm) {
    const parts = s.replace(/\s*(AM|PM)\s*$/, "").split(":");
    if (parts.length !== 2) throw new Error("Invalid time: " + input);
    hh = parseInt(parts[0], 10);
    mm = parseInt(parts[1], 10);
    const isPM = s.endsWith("PM");
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) throw new Error("Invalid time: " + input);
    if (hh === 12) hh = 0; // 12:xx AM -> 0:xx
    if (isPM) hh += 12;    // PM adds 12, 12 PM becomes 12 since hh was 0+12
  } else {
    const parts = s.split(":");
    if (parts.length !== 2) throw new Error("Invalid time: " + input);
    hh = parseInt(parts[0], 10);
    mm = parseInt(parts[1], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) throw new Error("Invalid time: " + input);
  }

  return hh * 60 + mm;
}

function minutesToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toDateStrLocal(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

module.exports = { hhmmToMinutes, minutesToHHMM, toDateStrLocal };
