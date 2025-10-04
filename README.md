# Satta Backend (Node.js + MongoDB)

## Quick Start
```bash
npm i
cp .env.example .env
# edit .env if needed
npm run seed:games
npm run dev
```

## API
- `GET /api/health`
- `GET /api/v1/games`
- `POST /api/v1/results` (body: { gameCode, dateStr, time, value, note? })
- `GET /api/v1/results/timewise?dateStr=YYYY-MM-DD`
- `GET /api/v1/results/snapshot?dateStr=YYYY-MM-DD&time=HH:mm`
- `GET /api/v1/results/monthly?year=YYYY&month=M&games=GALI,DSWR,GZBD,FRBD`

## Notes
- All dates are strings like `YYYY-MM-DD` (IST).
- Times accepted: `HH:mm` or `h:mm AM/PM`.
- Missing values are returned as `"XX"`.