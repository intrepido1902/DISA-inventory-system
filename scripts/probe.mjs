import { createClient } from '@supabase/supabase-js';
// Credentials are read from the project .env file (loaded via node --env-file=.env or dotenv)
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY ?? '';
if (!SUPABASE_URL || !supabaseKey) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, supabaseKey, { auth: { persistSession: false } });

// Fetch one Movement row to see all columns
const { data, error } = await db.from('Movement').select('*').limit(1);
if (error) { console.error('Movement error:', error); }
else { console.log('Movement columns:', Object.keys(data?.[0] ?? {})); console.log('Sample row:', JSON.stringify(data?.[0], null, 2)); }

// Fetch today's EXIT movements (wide date range to ensure we catch any)
const { data: exits, error: e2 } = await db
  .from('Movement')
  .select('id, type, meters, createdAt')
  .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
  .order('createdAt', { ascending: false })
  .limit(5);
if (e2) console.error('exits error:', e2);
else console.log('\nLast 5 EXIT movements:', JSON.stringify(exits, null, 2));
