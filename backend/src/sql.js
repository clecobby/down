// Database access. Production uses Amazon Aurora DSQL (serverless Postgres, IAM auth, no password);
// local dev and tests use a SQLite file. Queries are written once, with `?` placeholders, in SQL that
// both understand (ON CONFLICT, RETURNING, …).
//
//   await sql.one('SELECT * FROM users WHERE id = ?', id)   → row or undefined
//   await sql.all('SELECT …', …)                            → rows
//   await sql.run('UPDATE …', …)                            → { changes, rows } (rows when RETURNING)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function postgres() {
  const pg = (await import('pg')).default;
  const { AuroraDSQLPool } = await import('@aws/aurora-dsql-node-postgres-connector');
  // BIGINT (timestamps in ms, counts) as JS numbers rather than strings.
  pg.types.setTypeParser(20, (v) => Number(v));
  const pool = new AuroraDSQLPool({
    host: process.env.DSQL_HOST,
    user: process.env.DSQL_USER || 'admin',
    database: 'postgres',
    max: Number(process.env.DSQL_POOL || 3),
    idleTimeoutMillis: 60_000,
  });
  // `?` → `$1, $2, …` (none of our SQL has a literal question mark).
  const toPg = (text) => {
    let n = 0;
    return text.replace(/\?/g, () => `$${++n}`);
  };
  const query = (text, params) => pool.query(toPg(text), params);
  return {
    kind: 'dsql',
    one: async (text, ...p) => (await query(text, p)).rows[0],
    all: async (text, ...p) => (await query(text, p)).rows,
    run: async (text, ...p) => {
      const r = await query(text, p);
      return { changes: r.rowCount, rows: r.rows };
    },
    end: () => pool.end(),
  };
}

async function sqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const { sqliteSchema } = await import('./schema.js');
  const db = new DatabaseSync(process.env.DB_PATH || path.join(dir, '..', 'down.db'));
  sqliteSchema(db);
  const returns = (text) => /\breturning\b/i.test(text);
  return {
    kind: 'sqlite',
    one: async (text, ...p) => db.prepare(text).get(...p),
    all: async (text, ...p) => db.prepare(text).all(...p),
    run: async (text, ...p) => {
      if (returns(text)) {
        const rows = db.prepare(text).all(...p);
        return { changes: rows.length, rows };
      }
      return { changes: Number(db.prepare(text).run(...p).changes), rows: [] };
    },
    end: async () => db.close(),
  };
}

export const sql = process.env.DSQL_HOST ? await postgres() : await sqlite();
