import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import http from "node:http";
import {
  createApp,
  MAX_TEXT_LENGTH,
  MAX_ASSIGNEE_LENGTH,
  SCHEMA_VERSION,
} from "../server.js";

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required to run the test suite, e.g. " +
      "TEST_DATABASE_URL=postgres://user:pass@host:5432/TasksAppTest npm test",
  );
}

const { app, pool } = await createApp(TEST_URL);

beforeEach(async () => {
  await pool.query("TRUNCATE tasks RESTART IDENTITY");
});

afterAll(async () => {
  await pool.end();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("tasks API", () => {
  it("GET /tasks starts empty", async () => {
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST /tasks creates a task and trims text", async () => {
    const res = await request(app).post("/tasks").send({ text: "  leche  " });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe("leche");
    expect(res.body.done).toBe(false);

    const list = await request(app).get("/tasks");
    expect(list.body).toHaveLength(1);
  });

  it("POST /tasks rejects empty text with 400", async () => {
    for (const body of [{}, { text: "" }, { text: "   " }, { text: 42 }]) {
      const res = await request(app).post("/tasks").send(body);
      expect(res.status).toBe(400);
    }
  });

  it("POST /tasks rejects text over the limit with 400", async () => {
    const res = await request(app)
      .post("/tasks")
      .send({ text: "x".repeat(MAX_TEXT_LENGTH + 1) });
    expect(res.status).toBe(400);
  });

  it("PUT /tasks/:id toggles done and returns the task", async () => {
    const created = await request(app).post("/tasks").send({ text: "pan" });
    const toggled = await request(app).put(`/tasks/${created.body.id}`);
    expect(toggled.status).toBe(200);
    expect(toggled.body.done).toBe(true);
    const back = await request(app).put(`/tasks/${created.body.id}`);
    expect(back.body.done).toBe(false);
  });

  it("PUT /tasks/:id returns 404 for unknown id and 400 for invalid id", async () => {
    expect((await request(app).put("/tasks/9999")).status).toBe(404);
    expect((await request(app).put("/tasks/abc")).status).toBe(400);
  });

  it("DELETE /tasks/:id removes the task", async () => {
    const created = await request(app).post("/tasks").send({ text: "huevos" });
    const res = await request(app).delete(`/tasks/${created.body.id}`);
    expect(res.status).toBe(204);
    const list = await request(app).get("/tasks");
    expect(list.body).toEqual([]);
  });

  it("DELETE /tasks/:id returns 404 for unknown id and 400 for invalid id", async () => {
    expect((await request(app).delete("/tasks/9999")).status).toBe(404);
    expect((await request(app).delete("/tasks/abc")).status).toBe(400);
  });
});

describe("PATCH /tasks/:id", () => {
  it("edits text and trims whitespace", async () => {
    const created = await request(app).post("/tasks").send({ text: "leche" });
    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .send({ text: "  leche desnatada  " });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("leche desnatada");
    expect(res.body.id).toBe(created.body.id);
  });

  it("does not change the done flag", async () => {
    const created = await request(app).post("/tasks").send({ text: "pan" });
    await request(app).put(`/tasks/${created.body.id}`);
    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .send({ text: "pan integral" });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it("rejects empty, non-string or too-long text with 400", async () => {
    const created = await request(app).post("/tasks").send({ text: "algo" });
    for (const body of [
      {},
      { text: "" },
      { text: "   " },
      { text: 42 },
      { text: "x".repeat(MAX_TEXT_LENGTH + 1) },
    ]) {
      const res = await request(app)
        .patch(`/tasks/${created.body.id}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it("returns 404 for unknown id and 400 for invalid id", async () => {
    expect(
      (await request(app).patch("/tasks/9999").send({ text: "x" })).status,
    ).toBe(404);
    expect(
      (await request(app).patch("/tasks/abc").send({ text: "x" })).status,
    ).toBe(400);
  });
});

describe("schema and migrations", () => {
  it("stamps SCHEMA_VERSION and creates the expected columns", async () => {
    const { rows } = await pool.query(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    );
    expect(rows[0].version).toBe(SCHEMA_VERSION);
    const cols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'tasks'`,
    );
    const byName = Object.fromEntries(
      cols.rows.map((c) => [c.column_name, c.data_type]),
    );
    expect(byName).toMatchObject({
      id: "integer",
      text: "text",
      done: "boolean",
      assignee: "text",
      due_date: "date",
      priority: "text",
    });
  });

  it("migrate is idempotent and preserves rows", async () => {
    await request(app).post("/tasks").send({ text: "queda" });
    const again = await createApp(TEST_URL);
    try {
      const { rows } = await again.pool.query(
        "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
      );
      expect(rows[0].version).toBe(SCHEMA_VERSION);
      const list = await request(again.app).get("/tasks");
      expect(list.body.map((t) => t.text)).toEqual(["queda"]);
    } finally {
      await again.pool.end();
    }
  });
});

describe("task fields (assignee, due_date, priority)", () => {
  it("POST stores all fields and trims assignee", async () => {
    const res = await request(app).post("/tasks").send({
      text: "compra",
      assignee: "  Ana  ",
      due_date: "2026-12-31",
      priority: "high",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      text: "compra",
      assignee: "Ana",
      due_date: "2026-12-31",
      priority: "high",
    });
  });

  it("due_date round-trips as an exact YYYY-MM-DD string", async () => {
    const created = await request(app)
      .post("/tasks")
      .send({ text: "fecha", due_date: "2026-02-28" });
    expect(created.body.due_date).toBe("2026-02-28");
    const fetched = await request(app).get("/tasks");
    expect(fetched.body[0].due_date).toBe("2026-02-28");
  });

  it("POST applies defaults when fields are absent", async () => {
    const res = await request(app).post("/tasks").send({ text: "simple" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      assignee: null,
      due_date: null,
      priority: "normal",
    });
  });

  it("POST rejects invalid fields with 400", async () => {
    const cases = [
      { priority: "urgent" },
      { due_date: "31-12-2026" },
      { due_date: "2026-13-40" },
      { due_date: 20261231 },
      { assignee: 42 },
      { assignee: "x".repeat(MAX_ASSIGNEE_LENGTH + 1) },
    ];
    for (const extra of cases) {
      const res = await request(app)
        .post("/tasks")
        .send({ text: "t", ...extra });
      expect(res.status).toBe(400);
    }
  });

  it("PATCH updates fields partially", async () => {
    const created = await request(app).post("/tasks").send({ text: "tarea" });
    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .send({ assignee: "Luis", priority: "low" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      text: "tarea",
      assignee: "Luis",
      priority: "low",
    });
  });

  it("PATCH clears a field with null", async () => {
    const created = await request(app).post("/tasks").send({
      text: "tarea",
      assignee: "Ana",
      due_date: "2026-11-01",
    });
    const res = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .send({ assignee: null, due_date: null });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
    expect(res.body.due_date).toBeNull();
  });

  it("PATCH rejects empty update and invalid fields with 400", async () => {
    const created = await request(app).post("/tasks").send({ text: "tarea" });
    for (const body of [{}, { foo: 1 }, { priority: "ya" }]) {
      const res = await request(app)
        .patch(`/tasks/${created.body.id}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });
});

describe("realtime (revision + SSE)", () => {
  it("GET /revision starts at 0 and bumps on every mutation", async () => {
    const fresh = await createApp(TEST_URL);
    try {
      const getRev = async () =>
        (await request(fresh.app).get("/revision")).body.revision;
      expect(await getRev()).toBe(0);
      const created = await request(fresh.app)
        .post("/tasks")
        .send({ text: "t" });
      expect(await getRev()).toBe(1);
      await request(fresh.app).put(`/tasks/${created.body.id}`);
      expect(await getRev()).toBe(2);
      await request(fresh.app)
        .patch(`/tasks/${created.body.id}`)
        .send({ priority: "high" });
      expect(await getRev()).toBe(3);
      await request(fresh.app).delete(`/tasks/${created.body.id}`);
      expect(await getRev()).toBe(4);
    } finally {
      await fresh.pool.end();
    }
  });

  it("GET /tasks carries the current revision in X-Revision", async () => {
    const fresh = await createApp(TEST_URL);
    try {
      const before = await request(fresh.app).get("/tasks");
      expect(Number(before.headers["x-revision"])).toBe(0);
      await request(fresh.app).post("/tasks").send({ text: "t" });
      const after = await request(fresh.app).get("/tasks");
      expect(Number(after.headers["x-revision"])).toBe(1);
    } finally {
      await fresh.pool.end();
    }
  });

  it("GET /events sends hello then pushes changes", async () => {
    const fresh = await createApp(TEST_URL);
    const server = fresh.app.listen(0);
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const seen = [];
    let resolveNext = null;
    let buf = "";
    const req = http.get(`${base}/events`, (res) => {
      expect(res.headers["content-type"]).toBe("text/event-stream");
      res.on("data", (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = raw.split("\n").find((l) => l.startsWith("data:"));
          if (line) {
            const ev = JSON.parse(line.slice("data:".length).trim());
            if (resolveNext) {
              const r = resolveNext;
              resolveNext = null;
              r(ev);
            } else {
              seen.push(ev);
            }
          }
        }
      });
    });
    const nextEvent = (timeoutMs = 5000) => {
      if (seen.length > 0) return Promise.resolve(seen.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          resolveNext = null;
          reject(new Error("SSE timeout"));
        }, timeoutMs);
        resolveNext = (ev) => {
          clearTimeout(t);
          resolve(ev);
        };
      });
    };
    try {
      const hello = await nextEvent();
      expect(hello).toEqual({ type: "hello", revision: 0 });
      await fetch(`${base}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "realtime" }),
      });
      const change = await nextEvent();
      expect(change).toEqual({ type: "change", revision: 1 });
    } finally {
      req.destroy();
      await new Promise((resolve) => server.close(resolve));
      await fresh.pool.end();
    }
  }, 15000);
});
