import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, MAX_TEXT_LENGTH } from "../server.js";

const { app, db } = createApp(":memory:");

beforeEach(() => {
  db.prepare("DELETE FROM tasks").run();
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
    expect(toggled.body.done).toBeTruthy();
    const back = await request(app).put(`/tasks/${created.body.id}`);
    expect(back.body.done).toBeFalsy();
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
    expect(res.body.done).toBeTruthy();
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
