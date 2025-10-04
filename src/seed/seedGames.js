const { connectDB } = require("../db");
const Game = require("../models/Game");

const GAMES = [
  { name: "DESAWAR", code: "DSWR" },
  { name: "FARIDABAD", code: "FRBD" },
  { name: "GHAZIABAD", code: "GZBD" },
  { name: "GALI", code: "GALI" },
  { name: "NEW GANGA", code: "NGNG" },
  { name: "MAA BHAGWATI", code: "MBGT" },
  { name: "BADLAPUR", code: "BDLP" },
  { name: "MOHALI", code: "MOHL" },
  { name: "DELHI BAZAR", code: "DLBZ" },
  { name: "MEERUT CITY", code: "MRTC" }
];

async function main() {
  await connectDB();
  await Game.deleteMany({});
  for (let i = 0; i < GAMES.length; i++) {
    await Game.create({
      ...GAMES[i],
      orderIndex: i + 1,
      isActive: true
    });
  }
  console.log("Seeded 10 games");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
