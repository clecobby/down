// Creates the tables in Aurora DSQL (one statement per transaction). Safe to run again.
//   DSQL_HOST=<cluster>.dsql.us-east-1.on.aws npm run migrate
import { sql } from '../src/sql.js';
import { dsqlSchema } from '../src/schema.js';

if (sql.kind !== 'dsql') throw new Error('Set DSQL_HOST to migrate Aurora DSQL (SQLite sets itself up).');
for (const stmt of dsqlSchema) {
  const name = stmt.match(/(?:TABLE|INDEX ASYNC) IF NOT EXISTS (\w+)/)?.[1];
  await sql.run(stmt);
  console.log('ok', name);
}
await sql.end();
