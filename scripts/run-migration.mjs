import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('❌ Falta variable de entorno: DATABASE_URL');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

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

await client.connect();
await client.query(SQL);
console.log('✓ Tabla OrphanRemnant creada (o ya existía).');

// Verify
const { rows } = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'OrphanRemnant' ORDER BY ordinal_position`);
console.log('\nColumnas:');
rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

await client.end();
