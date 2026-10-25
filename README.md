# FitTrack

A personal workout tracker with a weekly split, per-day workout logging, full
history and an exercise-by-exercise progress tracker.

<img src="client/public/icons/icon-512.png" width="96" alt="FitTrack icon">

## What it does

- **Weekly programme** — Monday and Thursday are Chest + Triceps, Tuesday and
  Friday are Back + Biceps, Wednesday is Shoulders, Saturday is Legs and
  Sunday is a rest day. Every day on the dashboard opens its own workout.
- **Independent sets** — every exercise has exactly three sets, and each set
  has its own weight (decimals allowed), reps and completion toggle.
- **Previous workout data** — the last session of that day is shown next to the
  new inputs, so you can see the last weight and reps for every set.
- **Live statistics** — total reps, total volume (dumbbell exercises count
  twice), completed sets, completed exercises and the completion percentage.
- **Comparison indicators** — green up arrows for gains, red down arrows for
  decreases, set-by-set weight and rep deltas and the percentage volume change.
- **Full history** — every saved session of a day, newest first, with the
  complete breakdown and a side-by-side comparison of any two dates.
- **Progress tracker** — per-exercise personal records and Recharts charts of
  set-by-set weight progression and volume over time.
- **Installable** — ships as a PWA, so it can be added to a phone's home
  screen and works offline.

## Stack

| Layer | Technology |
| ----- | ---------- |
| Client | React 19, TypeScript, Tailwind CSS v4, Vite, Recharts, Lucide |
| Server | Express 5, TypeScript, Zod, MySQL2 |
| Database | MySQL 8 |

## Project layout

```
.
├── client/                 React app (Vite)
│   ├── public/             PWA manifest, service worker, icons
│   └── src/
│       ├── components/     Shared UI
│       ├── pages/          Dashboard, DayWorkout, DayHistory, Progress…
│       ├── services/       API client
│       ├── types/          Shared TypeScript interfaces
│       └── utils/          Volume maths, formatting, save queue
├── server/                 Express API
│   └── src/
│       ├── config/         Database pool and environment
│       ├── controllers/    Request handlers
│       ├── middleware/     Validation and error handling
│       ├── routes/         Express routers
│       ├── services/       Business logic
│       └── utils/          Schemas and volume maths
├── database/
│   ├── schema.sql          Full schema
│   └── migrations/         Ordered, additive migrations
└── scripts/                Smoke tests and icon generation
```

## Getting started

### 1. Database

Apply the schema. It creates the database as well, so this is the only step
needed to get a working schema:

```bash
mysql -u root -p < database/schema.sql
```

The database user is created separately. Give it access to the schema:

```sql
CREATE USER 'fittrack_app'@'localhost' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON workout_tracker.* TO 'fittrack_app'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Server

```bash
cd server
npm install
cp .env.example .env      # then fill in the real values
npm run migrate           # apply the migrations in order
npm run dev               # http://localhost:5050
```

The server reads its configuration from `server/.env`, which is git-ignored and
must never be committed. `server/.env.example` holds the placeholder values.

### 3. Client

```bash
cd client
npm install
npm run dev               # http://localhost:5173
```

The Vite dev server proxies `/api` to the backend on port 5050.

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `PORT` | Port the API listens on (5050 by default here) |
| `DB_HOST`, `DB_PORT` | MySQL host and port |
| `DB_USER`, `DB_PASSWORD` | MySQL credentials |
| `DB_NAME` | Schema name |
| `CORS_ORIGIN` | Comma-separated list of allowed origins |
| `VITE_API_BASE_URL` | Client only — API URL when the client is hosted separately |

## Commands

```bash
# Server
npm run dev         # watch mode
npm run build       # compile to dist/
npm start           # run the compiled server
npm run migrate     # apply pending migrations
npm test            # Vitest suite
npm run typecheck   # TypeScript check

# Client
npm run dev         # Vite dev server
npm run build       # production build into dist/
npm run preview     # serve the production build
```

## Data safety

- Saving a workout never overwrites or deletes an earlier session — each
  workout is a new row in `workout_sessions`.
- A blank input is never stored as a zero-weight set. Only sets with both a
  weight and a rep count are written, and only completed sets count towards
  the volume and rep totals.
- Writes are serialised through a queue on the client and use an upsert with
  a deadlock retry on the server, so two quick saves cannot corrupt a set.

## License

Private project. All rights reserved.
</content>