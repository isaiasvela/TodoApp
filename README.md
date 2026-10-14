# Family Todo App

A simple shared task list for a family or household: create, complete and delete tasks, with PostgreSQL persistence. Single-service Node.js + Express app; the same process serves the API and a small static frontend.

## Stack

- **Backend:** Node.js 20 + Express 4 (ESM)
- **Database:** PostgreSQL 15+ (external server) via `pg`
- **Frontend:** static HTML/CSS/JS in `backend/public/` (no build step)
- **Deploy:** Docker + GitHub Actions → GHCR

## Run locally

Requires a reachable PostgreSQL and `DATABASE_URL`:

```bash
cd backend
npm install
DATABASE_URL=postgres://user:pass@host:5432/TasksApp npm start  # http://localhost:3000
```

With a second address (e.g. LAN/VPN roaming), the fallback is tried in order:

```bash
DATABASE_URL=postgres://user:pass@192.168.1.52:5432/TasksApp \
DATABASE_URL_FALLBACK=postgres://user:pass@10.200.200.1:5432/TasksApp \
npm start
```

With Docker (copy `.env.example` to `.env` first — never commit `.env`):

```bash
docker compose up --build
```

`npm start` also reads `../.env` automatically (explicit environment variables win over the file).

## API

| Method | Route | Notes |
| ------ | ----- | ----- |
| `GET` | `/` | static frontend |
| `GET` | `/health` | `{ "status": "ok" }` (Docker healthcheck) |
| `GET` | `/revision` | `{ "revision": N }` — in-memory counter, bumped on every mutation |
| `GET` | `/events` | Server-Sent Events stream: `hello` on connect, `change` on every mutation |
| `GET` | `/tasks` | list tasks ordered by id (with `X-Revision` header) |
| `POST` | `/tasks` `{ "text", "assignee?", "due_date?", "priority?" }` | 201 with created task; 400 if empty or > 500 chars |
| `PUT` | `/tasks/:id` | toggles `done`; 400 invalid id, 404 unknown id |
| `PATCH` | `/tasks/:id` `{ "text?", "assignee?", "due_date?", "priority?" }` | partial edit (at least one field); 400 on invalid values, 400 invalid id, 404 unknown id |
| `DELETE` | `/tasks/:id` | 204 on delete; 400 invalid id, 404 unknown id |

Field notes: `done` is a JSON boolean, `due_date` is a `YYYY-MM-DD` string (stored as native `DATE`), `priority` is `low|normal|high` (default `normal`).

## Realtime & profiles

- Open `GET /events` (SSE) to push `{ "type": "change", "revision": N }` to all connected browsers on every mutation — no polling, no schema change. The revision counter is in-memory (resets on restart); clients resync on (re)connect, so nothing is missed.
- Profiles are frontend-only: pick "Soy: Ana" (stored in `localStorage`), new tasks default to you, "Mías" filters your tasks. No passwords — designed for a family LAN.

## Scripts (`backend/`)

- `npm start` — run the server (needs `DATABASE_URL`)
- `npm run dev` — run with `node --watch`
- `npm test` — run API tests, **requires `TEST_DATABASE_URL`** pointing to a dedicated test database (tests `TRUNCATE`; never point it at real data)
- `npm run lint` — eslint
- `npm run format` — prettier check

## Configuration

- `DATABASE_URL` (required), `DATABASE_URL_FALLBACK` (optional), `PORT` (default `3000`), `TEST_DATABASE_URL` (tests only)
- Schema auto-migrated on boot (`schema_migrations` table; `tasks(id, text, done BOOLEAN, assignee, due_date DATE, priority + CHECK)`)
- `docker-compose.yml` — builds `./backend`, passes `DATABASE_URL` through (from `.env`), no volumes
- CI: `.github/workflows/docker.yml` — spins up postgres, lint + test on every push/PR; Docker build + push to GHCR only on push to `main`

## Note on the SQLite past

Up to Fase 3 the app used `backend/db.sqlite` (`better-sqlite3`). That file is abandoned and left on disk untouched — by decision it was **not** imported into PostgreSQL. Never commit runtime DB files or credentials.

## License

MIT
