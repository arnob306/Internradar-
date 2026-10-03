// Publish (or unpublish) the seeded programs in the LOCAL database, so the web app has
// something to show while you build it.
//
//   node scripts/dev-publish.mjs          publish every seeded program
//   node scripts/dev-publish.mjs --undo   unpublish them again
//
// This is a development convenience and nothing more: it refuses any database that is not on
// this machine, and it never marks a program as verified. A person verifies programs by
// editing data/seed/catalog.yaml (verified_on), which is what makes one real.

import pg from "pg";
import process from "node:process";
import { URL } from "node:url";

const ADMIN_URL =
  process.env.INTERNRADAR_TEST_ADMIN_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const say = (text) => process.stdout.write(`${text}\n`);
const complain = (text) => process.stderr.write(`${text}\n`);

const host = new URL(ADMIN_URL).hostname;
if (!LOCAL_HOSTS.has(host)) {
  complain(`refusing to change a non-local database (host: ${host})`);
  process.exit(1);
}

const undo = process.argv[2] === "--undo";
if (process.argv.length > 2 && !undo) {
  complain("usage: node scripts/dev-publish.mjs [--undo]");
  process.exit(2);
}

const db = new pg.Client({ connectionString: ADMIN_URL });
await db.connect();
try {
  // Two kinds of rows are left alone. Test companies: the web tests manage their own data. And
  // any program a person has verified: publishing or unpublishing those is a human decision, and
  // this convenience must never undo it.
  const result = await db.query(
    `update public.programs set is_published = $1
     where is_published <> $1
       and eligibility_verified_at is null
       and company_id in (select id from public.companies where slug not like 'dbtest-%')`,
    [!undo],
  );
  say(`${undo ? "unpublished" : "published"} ${result.rowCount} program(s) in the local database`);
} finally {
  await db.end();
}
