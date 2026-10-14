# AGENTS.md — TodoApp

## Project Memory

Before making changes to the project, read `MEMORY.md` from the project root.

`MEMORY.md` contains persistent project knowledge, architectural decisions, conventions, constraints, known issues and other context that may not be obvious from the code.

Keep `MEMORY.md` up to date when making decisions or changes that future sessions should know about.

## What this is
- Single-service Express app. `backend/server.js` is the API; static frontend lives in `backend/public/` (served at `GET /`). No build step, no separate frontend dir.

## Run
- `cd backend && npm install && npm start` → http://localhost:3000 (`PORT`/`DB_PATH` env vars override port and SQLite path)
- `docker compose up --build` (builds `./backend`, mounts `./db.sqlite:/app/db.sqlite`)
- Tests: `npm test` (`backend/`, vitest + supertest, 13 API tests). Lint: `npm run lint`. Format check: `npm run format`.

## Conventions
- ESM (`"type": "module"`); use `import`, not `require`.
- SQLite via `better-sqlite3` (WAL mode); schema auto-created (`tasks(id, text, done)`). Use `createApp(":memory:")` from `backend/server.js` for tests — importing it has no side effects.
- API: `GET /tasks`, `POST /tasks {text}` (400 if empty/>500 chars, 201 with task), `PUT /tasks/:id` (toggles `done`; 400/404), `PATCH /tasks/:id {text}` (edits text; 400/404), `DELETE /tasks/:id` (204; 400/404). `GET /health` for healthchecks.
- Prettier style enforced (`npm run format`); eslint flat config in `backend/eslint.config.js`.

## CI
- `.github/workflows/docker.yml`: lint + test on push/PR; push to `main` also builds `./backend` and pushes `:latest` + `:<sha>` to GHCR.

## Do not assume
- Old `README.md` claims (React/PostgreSQL/Terraform/AWS) were removed 2026-10-14; current `README.md` describes the real app. Still trust code over docs on conflict.
