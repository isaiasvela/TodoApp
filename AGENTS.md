# AGENTS.md — TodoApp

## Project Memory

Before making changes to the project, read `MEMORY.md` from the project root.

`MEMORY.md` contains persistent project knowledge, architectural decisions, conventions, constraints, known issues and other context that may not be obvious from the code.

Keep `MEMORY.md` up to date when making decisions or changes that future sessions should know about.

## What this is
- Single-service Express app. `backend/server.js` is the API; static frontend lives in `backend/public/` (served at `GET /`). No build step, no separate frontend dir.

## Run
- `cd backend && npm install && npm start` → http://localhost:3000 (`npm start` reads `../.env` for `DATABASE_URL`; explicit env vars win. No SQLite anymore)
- `docker compose up --build` (needs `DATABASE_URL` in `.env` — copy `.env.example`; never commit `.env`)
- Tests: `npm test` (`backend/`, vitest + supertest, 25 API tests) **requires `TEST_DATABASE_URL`** pointing at a throwaway test DB (tests `TRUNCATE`). Lint: `npm run lint`. Format check: `npm run format`.

## Conventions
- ESM (`"type": "module"`); use `import`, not `require`.
- PostgreSQL via `pg` Pool (`backend/db.js`); no SQLite, no `better-sqlite3`. Schema versioned in `schema_migrations` (`tasks(id SERIAL, text, done BOOLEAN, assignee, due_date DATE, priority + CHECK)`). `DATE` columns are parsed as `YYYY-MM-DD` strings (custom type parser, no timezone shifts); `done` is a JSON boolean.
- Route SQL uses `$1, $2…` placeholders; every async route goes through `asyncHandler` (Express 4 drops rejected promises otherwise). Use `await createApp(url)` from `backend/server.js` for tests — importing it has no side effects; close pools (`pool.end()`) or vitest hangs.
- API: `GET /tasks` (with `X-Revision` header), `POST /tasks {text, assignee?, due_date?, priority?}` (400 if empty/>500 chars, 201 with task), `PUT /tasks/:id` (toggles `done`; 400/404), `PATCH /tasks/:id` (partial edit; 400/404), `DELETE /tasks/:id` (204; 400/404). `due_date` is `YYYY-MM-DD`, `priority` is `low|normal|high` (default `normal`). `GET /health` for healthchecks. Realtime: `GET /revision` + `GET /events` (SSE `hello`/`change`); in-memory revision resets on restart, clients resync on connect.
- Profiles are frontend-only (`localStorage todo.profile`): prefill assignee, "Mías" filter, `.me` chip. No backend change, no passwords.
- Prettier style enforced (`npm run format`); eslint flat config in `backend/eslint.config.js`.

## CI
- `.github/workflows/docker.yml`: spins up postgres (`TEST_DATABASE_URL`), lint + test on push/PR; push to `main` also builds `./backend` and pushes `:latest` + `:<sha>` to GHCR.

## Do not assume
- Old `README.md` claims (React/PostgreSQL/Terraform/AWS) were removed 2026-10-14; current `README.md` describes the real app. Still trust code over docs on conflict.
