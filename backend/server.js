import express from "express";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MAX_TEXT_LENGTH = 500;

function parseId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function createApp(dbFile) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  if (dbFile !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
  }
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      done INTEGER DEFAULT 0
    )
    `,
  ).run();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/tasks", (_req, res) => {
    const tasks = db.prepare("SELECT * FROM tasks ORDER BY id").all();
    res.json(tasks);
  });

  app.post("/tasks", (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "text is required" });
    if (text.length > MAX_TEXT_LENGTH) {
      return res
        .status(400)
        .json({ error: `text must be at most ${MAX_TEXT_LENGTH} characters` });
    }
    const info = db.prepare("INSERT INTO tasks (text) VALUES (?)").run(text);
    const task = db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(task);
  });

  app.put("/tasks/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid id" });
    const info = db
      .prepare("UPDATE tasks SET done = NOT done WHERE id = ?")
      .run(id);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    res.json(task);
  });

  app.patch("/tasks/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid id" });
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "text is required" });
    if (text.length > MAX_TEXT_LENGTH) {
      return res
        .status(400)
        .json({ error: `text must be at most ${MAX_TEXT_LENGTH} characters` });
    }
    const info = db
      .prepare("UPDATE tasks SET text = ? WHERE id = ?")
      .run(text, id);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    res.json(task);
  });

  app.delete("/tasks/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid id" });
    const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    if (info.changes === 0) return res.status(404).json({ error: "not found" });
    res.sendStatus(204);
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid JSON" });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return { app, db };
}

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || "db.sqlite";

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const { app } = createApp(DB_PATH);
  app.listen(PORT, () => {
    console.log(`🟢 App corriendo en http://localhost:${PORT}`);
  });
}
