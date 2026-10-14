import pg from "pg";

const { Pool, types } = pg;

// DATE (OID 1082) arrives as a plain "YYYY-MM-DD" string instead of a JS
// Date: no timezone shifts, API output stays identical to the old TEXT column.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const SCHEMA_VERSION = 1;

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
};

// Tries each URL in order (primary, then optional fallback) and returns the
// first pool that answers. Used for LAN/VPN roaming with two addresses.
export async function connect(urls) {
  const tried = [];
  let lastErr;
  for (const url of (Array.isArray(urls) ? urls : [urls]).filter(Boolean)) {
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    pool.on("error", (err) => console.error("PG pool error:", err.message));
    try {
      await pool.query("SELECT 1");
      return { pool, url };
    } catch (err) {
      tried.push(hostOf(url));
      lastErr = err;
      await pool.end().catch(() => {});
    }
  }
  throw new Error(
    `Cannot reach PostgreSQL (tried: ${tried.join(", ") || "none"}): ${lastErr ? lastErr.message : "no DATABASE_URL set"}`,
  );
}

const V1_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    assignee TEXT,
    due_date DATE,
    priority TEXT NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('low', 'normal', 'high'))
  )`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY
  )`,
];

// Runs pending migrations, transactionally. Add new version branches here;
// never edit applied ones.
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sql of V1_STATEMENTS) {
      await client.query(sql);
    }
    const { rows } = await client.query(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    );
    const version = rows[0] ? rows[0].version : 0;
    if (version < 1) {
      await client.query("INSERT INTO schema_migrations (version) VALUES (1)");
    }
    await client.query("COMMIT");
    return Math.max(version, 1);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export const TASK_COLUMNS = "id, text, done, assignee, due_date, priority";

export function toApiRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    text: row.text,
    done: Boolean(row.done),
    assignee: row.assignee,
    due_date: row.due_date,
    priority: row.priority,
  };
}
