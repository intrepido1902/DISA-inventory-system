/**
 * Creates the OrphanRemnant table via Supabase Management API.
 * Requires: SUPABASE_ACCESS_TOKEN env var (Supabase personal access token)
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/create-orphan-remnant.mjs
 *
 * If you don't have a token, run the SQL below manually in the Supabase SQL Editor:
 *   https://supabase.com/dashboard/project/jvljcoickaxgtukhcvxq/sql/new
 */

const PROJECT_REF = 'jvljcoickaxgtukhcvxq';

const SQL = `
CREATE TABLE IF NOT EXISTS "OrphanRemnant" (
  "id"              BIGSERIAL PRIMARY KEY,
  "reference"       TEXT NOT NULL,
  "color"           TEXT NOT NULL DEFAULT '',
  "estimatedMeters" REAL NOT NULL,
  "width"           INTEGER NOT NULL DEFAULT 0,
  "location"        TEXT NOT NULL DEFAULT '',
  "notes"           TEXT,
  "status"          TEXT NOT NULL DEFAULT 'AVAILABLE'
                    CHECK ("status" IN ('AVAILABLE', 'SOLD', 'DISCARDED')),
  "createdBy"       BIGINT REFERENCES "User"("id"),
  "createdAt"       BIGINT NOT NULL,
  "updatedAt"       BIGINT NOT NULL
);
`;

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('⚠ SUPABASE_ACCESS_TOKEN no definido.');
  console.log('');
  console.log('Ejecuta este SQL manualmente en:');
  console.log('  https://supabase.com/dashboard/project/jvljcoickaxgtukhcvxq/sql/new');
  console.log('');
  console.log('─'.repeat(60));
  console.log(SQL);
  console.log('─'.repeat(60));
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: SQL }),
});

const json = await res.json();
if (!res.ok) {
  console.error('Error:', JSON.stringify(json, null, 2));
  process.exit(1);
}
console.log('✓ Tabla OrphanRemnant creada (o ya existía).');
