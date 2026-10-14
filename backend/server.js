import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  connect,
  migrate,
  toApiRow,
  TASK_COLUMNS,
  SCHEMA_VERSION,
} from "./db.js";

export { SCHEMA_VERSION };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loads repo-root .env (created from .env.example). Already-set variables
// always win, so explicit env still overrides the file.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

export const MAX_TEXT_LENGTH = 500;
export const MAX_ASSIGNEE_LENGTH = 100;
export const PRIORITIES = ["low", "normal", "high"];

// Express 4 does not forward rejected promises from async handlers, so every
// async route must go through this wrapper or failures hang silently.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parseId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function parseTextValue(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw badRequest("text is required");
  if (text.length > MAX_TEXT_LENGTH) {
    throw badRequest(`text must be at most ${MAX_TEXT_LENGTH} characters`);
  }
  return text;
}

// undefined = absent (leave as-is / apply default), null = clear field.
function parseAssignee(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw badRequest("assignee must be a string");
  const name = value.trim();
  if (!name) return null;
  if (name.length > MAX_ASSIGNEE_LENGTH) {
    throw badRequest(
      `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`,
    );
  }
  return name;
}

function parseDueDate(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest("due_date must be YYYY-MM-DD");
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw badRequest("due_date is not a valid date");
  }
  return value;
}

function parsePriority(value) {
  if (value === undefined) return undefined;
  if (!PRIORITIES.includes(value)) {
    throw badRequest(`priority must be one of: ${PRIORITIES.join(", ")}`);
  }
  return value;
}

export async function createApp(connectionString) {
  const { pool } = await connect(connectionString);
  await migrate(pool);

  const app = express();
  app.use(express.json({ limit: "100kb" }));

  // Realtime: in-memory revision, bumped on every mutation and pushed
  // to SSE clients. Resets on restart; clients resync on (re)connect
  // via the hello event, so no comparison against stale values.
  // NOTE: with several app replicas each keeps its own counter.
  let revision = 0;
  const sseClients = new Set();
  function broadcast() {
    revision += 1;
    const payload = `data: ${JSON.stringify({ type: "change", revision })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/revision", (_req, res) => {
    res.json({ revision });
  });

  app.get("/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "hello", revision })}\n\n`);
    sseClients.add(res);
    req.on("close", () => {
      sseClients.delete(res);
    });
  });

  app.use(express.static(path.join(__dirname, "public")));

  app.get(
    "/tasks",
    asyncHandler(async (_req, res) => {
      const { rows } = await pool.query(
        `SELECT ${TASK_COLUMNS} FROM tasks ORDER BY id`,
      );
      res.set("X-Revision", String(revision));
      res.json(rows.map(toApiRow));
    }),
  );

  app.post(
    "/tasks",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const text = parseTextValue(body.text);
      const assignee = parseAssignee(body.assignee) ?? null;
      const dueDate = parseDueDate(body.due_date) ?? null;
      const priority =
        body.priority === undefined ? "normal" : parsePriority(body.priority);
      const { rows } = await pool.query(
        `INSERT INTO tasks (text, assignee, due_date, priority)
         VALUES ($1, $2, $3, $4) RETURNING ${TASK_COLUMNS}`,
        [text, assignee, dueDate, priority],
      );
      broadcast();
      res.status(201).json(toApiRow(rows[0]));
    }),
  );

  app.put(
    "/tasks/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "invalid id" });
      const { rows } = await pool.query(
        `UPDATE tasks SET done = NOT done WHERE id = $1 RETURNING ${TASK_COLUMNS}`,
        [id],
      );
      if (rows.length === 0)
        return res.status(404).json({ error: "not found" });
      broadcast();
      res.json(toApiRow(rows[0]));
    }),
  );

  app.patch(
    "/tasks/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "invalid id" });
      const body = req.body ?? {};
      const sets = [];
      const values = [];
      const push = (column, value) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (body.text !== undefined) push("text", parseTextValue(body.text));
      if (body.assignee !== undefined)
        push("assignee", parseAssignee(body.assignee) ?? null);
      if (body.due_date !== undefined)
        push("due_date", parseDueDate(body.due_date) ?? null);
      if (body.priority !== undefined)
        push("priority", parsePriority(body.priority));
      if (sets.length === 0) throw badRequest("nothing to update");
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${TASK_COLUMNS}`,
        values,
      );
      if (rows.length === 0)
        return res.status(404).json({ error: "not found" });
      broadcast();
      res.json(toApiRow(rows[0]));
    }),
  );

  app.delete(
    "/tasks/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "invalid id" });
      const { rows } = await pool.query(
        "DELETE FROM tasks WHERE id = $1 RETURNING id",
        [id],
      );
      if (rows.length === 0)
        return res.status(404).json({ error: "not found" });
      broadcast();
      res.sendStatus(204);
    }),
  );

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid JSON" });
    }
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return { app, pool };
}

const PORT = Number(process.env.PORT) || 3000;

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is required, e.g. postgres://user:pass@host:5432/TasksApp " +
        "(optional DATABASE_URL_FALLBACK for a second address)",
    );
    process.exit(1);
  }
  const { app } = await createApp([
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_FALLBACK,
  ]);
  app.listen(PORT, () => {
    console.log(`🟢 App corriendo en http://localhost:${PORT}`);
  });
}
