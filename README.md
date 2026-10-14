# Family Todo App

A simple shared task list for a family or household: create, complete and delete tasks, with SQLite persistence. Single-service Node.js + Express app; the same process serves the API and a small static frontend.

## Stack

- **Backend:** Node.js 20 + Express 4 (ESM)
- **Database:** SQLite via `better-sqlite3` (file `db.sqlite`, auto-created)
- **Frontend:** static HTML/CSS/JS in `backend/public/` (no build step)
- **Deploy:** Docker + GitHub Actions → GHCR

## Run locally

```bash
cd backend
npm install
npm start        # http://localhost:3000
```

With custom port / DB location:

```bash
PORT=4000 DB_PATH=./data/todo.sqlite npm start
```

With Docker (builds `./backend`, persists `./db.sqlite`):

```bash
docker compose up --build
```

## API

| Method | Route | Notes |
| ------ | ----- | ----- |
| `GET` | `/` | static frontend |
| `GET` | `/health` | `{ "status": "ok" }` (Docker healthcheck) |
| `GET` | `/tasks` | list tasks ordered by id |
| `POST` | `/tasks` `{ "text" }` | 201 with created task; 400 if empty or > 500 chars |
| `PUT` | `/tasks/:id` | toggles `done`; 400 invalid id, 404 unknown id |
| `PATCH` | `/tasks/:id` `{ "text" }` | edits text; 400 if empty or > 500 chars, 400 invalid id, 404 unknown id |
| `DELETE` | `/tasks/:id` | 204 on delete; 400 invalid id, 404 unknown id |

## Scripts (`backend/`)

- `npm start` — run the server
- `npm run dev` — run with `node --watch`
- `npm test` — run API tests (vitest + supertest)
- `npm run lint` — eslint
- `npm run format` — prettier check

## Configuration

- `PORT` (default `3000`), `DB_PATH` (default `db.sqlite`, relative to CWD)
- `docker-compose.yml` — `build: ./backend`, port `3000:3000`, volume `./db.sqlite:/app/db.sqlite`
- CI: `.github/workflows/docker.yml` — lint + test on every push/PR; Docker build + push to GHCR only on push to `main`

## License

MIT
