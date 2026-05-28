import { createClient } from '@supabase/supabase-js';

const globalForDb = globalThis as unknown as {
  _supabase?: ReturnType<typeof createClient>;
};

if (!globalForDb._supabase) {
  globalForDb._supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const db = globalForDb._supabase!;
export default db;
