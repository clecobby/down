// Creates the tables in Aurora DSQL (one statement per transaction), then lets the app's database
// role read and write every table. Safe to run again.
//   DSQL_HOST=<cluster>.dsql.us-east-1.on.aws npm run migrate
// APP_DB_ROLE is the role the API connects as (DSQL_USER on the Lambda); default down_app.
import { sql } from '../src/sql.js';
import { dsqlSchema } from '../src/schema.js';

if (sql.kind !== 'dsql') throw new Error('Set DSQL_HOST to migrate Aurora DSQL (SQLite sets itself up).');
for (const stmt of dsqlSchema) {
  const name = stmt.match(/(?:TABLE|INDEX ASYNC|COLUMN) IF NOT EXISTS (\w+)/)?.[1];
  await sql.run(stmt);
  console.log('ok', name);
}

const role = process.env.APP_DB_ROLE || 'down_app';
if (!/^\w+$/.test(role)) throw new Error('APP_DB_ROLE must be a plain role name');
if (await sql.one('SELECT 1 FROM pg_roles WHERE rolname = ?', role)) {
  const tables = dsqlSchema.map((s) => s.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]).filter(Boolean);
  for (const t of tables) await sql.run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO ${role}`);
  console.log(`granted ${role} access to ${tables.length} tables`);
} else {
  console.log(`no ${role} role here; skipped grants`);
}
await sql.end();
