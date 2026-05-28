import { createClient } from '@supabase/supabase-js';
import { Pool, types } from 'pg';

// Parse BIGINT (createdAt, updatedAt) as JS number instead of string
types.setTypeParser(20, (val) => parseInt(val, 10));

const globalForDb = globalThis as unknown as {
  _supabase?: ReturnType<typeof createClient>;
  _pool?: Pool;
};

if (!globalForDb._supabase) {
  globalForDb._supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );
}

if (!globalForDb._pool) {
  globalForDb._pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
}

export const db = globalForDb._supabase!;
export const pool = globalForDb._pool!;
export default db;
