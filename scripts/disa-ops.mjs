/**
 * DISA Operations Script
 * Usage: node scripts/disa-ops.mjs [--revert] [--role] [--prices]
 *   --revert  : revert today's sale (movement id=18, rollId=6, 8.8m)
 *   --role    : change Adriana (id=3) from ADMIN → OWNER
 *   --prices  : upsert 18 refs × 9 clients into ClientPrice
 *   (no flags) : diagnostic only
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_URL || !supabaseKey) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, supabaseKey, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const DO_REVERT = args.includes('--revert');
const DO_ROLE   = args.includes('--role');
const DO_PRICES = args.includes('--prices');

// Colombia UTC-5 boundaries for 2026-08-20
const dayStartCOL = Date.UTC(2026, 7, 20, 5, 0, 0, 0);    // 2026-08-20T05:00:00Z
const dayEndCOL   = Date.UTC(2026, 7, 21, 4, 59, 59, 999); // 2026-08-21T04:59:59Z

// ── Client IDs (confirmed from DB) ──────────────────────────────────────────
const CLIENT_ID = {
  IMPLECOR:  8,
  MAURICIO:  9,
  JAVIER_B:  10,
  HAMMER:    11,
  OVER:      12,
  TEXICOR:   13,
  ACENTO:    14,
  CORT_BOG:  15,
  CLI_GRAL:  16,
};
const CLIENT_KEYS = ['IMPLECOR','MAURICIO','JAVIER_B','HAMMER','OVER','TEXICOR','ACENTO','CORT_BOG','CLI_GRAL'];

// ── Price matrix from TAREA 4 ────────────────────────────────────────────────
// [productRef, IMPLECOR, MAURICIO, JAVIER_B, HAMMER, OVER, TEXICOR, ACENTO, CORT_BOG, CLI_GRAL]
// LSFH refs use "PREFIX-COLOR" format (e.g. "LSFH2306-1") to match fixed baseRef()
// Numeric refs use plain number string (e.g. "2242") matching existing DB format
const PRICE_TABLE = [
  ['LSFH2306-1', 38809, 40653, 40653, 40000, 45000, 45000, 45000, 45000, 45000],
  ['LSFH2306-2', 38809, 40653, 40653, 40000, 45000, 45000, 45000, 45000, 45000],
  ['LSFH2306-3', 38809, 40653, 40653, 40000, 45000, 45000, 45000, 45000, 45000],
  ['LSFH2306-4', 38809, 40653, 40653, 40000, 45000, 45000, 45000, 45000, 45000],
  ['LSFH2306-5', 38809, 40653, 40653, 40000, 45000, 45000, 45000, 45000, 45000],
  ['LSFH2306-6', 38809, 40653, 40653, 40000, 45000, 45000, 45000, 45000, 45000],
  ['LSFH2307-1', 43810, 45594, 45594, 45000, 50000, 50000, 50000, 50000, 50000],
  ['LSFH2308-2', 43810, 45594, 45594, 45000, 50000, 50000, 50000, 50000, 50000],
  ['2211',       20230, 22015, 22015, 23520, 26000, 26000, 26000, 26000, 26000],
  ['2218',       16660, 18445, 18445, 21500, 21500, 21500, 21500, 21500, 21500],
  ['2209',       21420, 24990, 24990, 28000, 28000, 28000, 28000, 28000, 28000],
  ['2206',       21420, 24990, 24990, 28000, 28000, 28000, 28000, 28000, 28000],
  ['2215',       17850, 19635, 19635, 23000, 23000, 23000, 23000, 23000, 23000],
  ['2231',       21420, 24990, 24990, 28000, 28000, 28000, 28000, 28000, 28000],
  ['2237',       20230, 22015, 22015, 26000, 26000, 26000, 26000, 26000, 26000],
  ['2238',       16660, 18445, 18445, 21500, 21500, 21500, 21500, 21500, 21500],
  ['2203',       21420, 24990, 24990, 28000, 28000, 28000, 28000, 28000, 28000],
  ['2242',       28560, 30345, 30345, 37000, 38000, 38000, 38000, 38000, 38000],
];

async function main() {
  console.log('\n════════════════════════════════════════');
  console.log('  DISA OPS SCRIPT');
  console.log('════════════════════════════════════════\n');

  // ── TAREA 1 — Today's EXIT movements ──────────────────────────────────────
  console.log('▶ TAREA 1 — Ventas de hoy (2026-08-20 Colombia)\n');
  const { data: movs, error: movErr } = await db
    .from('Movement')
    .select(`id, type, meters, saleId, notes, createdAt,
      roll:rollId(id, rollNumber, currentMeters, initialMeters, status, product:productId(name, code)),
      user:userId(name),
      sale:saleId(id, total, client:clientId(name))
    `)
    .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
    .gte('createdAt', dayStartCOL)
    .lte('createdAt', dayEndCOL)
    .order('createdAt', { ascending: false });

  if (movErr) {
    console.error('  ✕ Error:', movErr.message);
  } else if (!movs || movs.length === 0) {
    console.log('  → No hay ventas registradas hoy.\n');
  } else {
    console.log(`  ${movs.length} movimiento(s) de salida hoy:\n`);
    for (const m of movs) {
      const ts = new Date(m.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      console.log(`  [ID ${m.id}] ${m.type} · ${m.meters}m`);
      console.log(`    Rollo: ${m.roll?.rollNumber} (id=${m.roll?.id})`);
      console.log(`    Producto: ${m.roll?.product?.code}`);
      console.log(`    Roll actual: ${m.roll?.currentMeters}m / ${m.roll?.initialMeters}m (${m.roll?.status})`);
      console.log(`    Cliente: ${m.sale?.client?.name ?? '—'} · Total venta: $${m.sale?.total ?? '—'}`);
      console.log(`    Usuario: ${m.user?.name} · Hora: ${ts}`);
      console.log('');
    }

    if (DO_REVERT) {
      // Guard: check if already reverted (a RETURN referencing this movement's ID exists)
      for (const m of movs) {
        const { data: existingReturn } = await db
          .from('Movement')
          .select('id')
          .eq('type', 'RETURN')
          .ilike('notes', `%#${m.id}%`)
          .maybeSingle();

        if (existingReturn) {
          console.log(`  ⚠ Movimiento ${m.id} ya tiene reversión (RETURN id=${existingReturn.id}). Saltando.\n`);
          continue;
        }

        const roll = m.roll;
        const metersToRestore = m.meters;
        const newMeters = Math.min(roll.initialMeters, roll.currentMeters + metersToRestore);
        let newStatus, newIsRemnant;
        if (newMeters === 0)                     { newStatus = 'DEPLETED'; newIsRemnant = 0; }
        else if (newMeters < roll.initialMeters)  { newStatus = 'REMNANT';  newIsRemnant = 1; }
        else                                      { newStatus = 'ACTIVE';   newIsRemnant = 0; }

        const now = Date.now();

        // Update roll
        const { error: rollErr } = await db.from('Roll').update({
          currentMeters: newMeters, status: newStatus, isRemnant: newIsRemnant, updatedAt: now,
        }).eq('id', roll.id);
        if (rollErr) { console.error(`  ✕ Error actualizando rollo ${roll.id}:`, rollErr.message); continue; }

        // Insert RETURN movement
        const { error: retErr } = await db.from('Movement').insert({
          type: 'RETURN',
          rollId: roll.id,
          meters: metersToRestore,
          userId: 1,
          saleId: null,
          notes: `Reversión del movimiento #${m.id} (script disa-ops)`,
          barcodeUsed: 0,
          createdAt: now,
        });
        if (retErr) { console.error(`  ✕ Error insertando RETURN:`, retErr.message); continue; }

        console.log(`  ✓ Movimiento ${m.id} revertido.`);
        console.log(`    Rollo ${roll.id}: ${roll.currentMeters}m → ${newMeters}m (${roll.status} → ${newStatus})\n`);
      }
    } else {
      console.log('  → Ejecuta con --revert para revertir.\n');
    }
  }

  // ── TAREA 2 — Role change ─────────────────────────────────────────────────
  if (DO_ROLE) {
    console.log('▶ TAREA 2 — Cambiando rol de Adriana (id=3) a OWNER...\n');
    const { data, error } = await db
      .from('User')
      .update({ role: 'OWNER' })
      .eq('id', 3)
      .select('id, username, name, role')
      .single();
    if (error) {
      console.error('  ✕ Error:', error.message);
    } else {
      console.log(`  ✓ Actualizado: id=${data.id} username="${data.username}" nombre="${data.name}" rol=${data.role}`);
      console.log('  → Adriana debe cerrar sesión y volver a entrar para que el nuevo rol surta efecto.\n');
    }
  }

  // ── TAREA 4 — Price upsert ────────────────────────────────────────────────
  if (DO_PRICES) {
    console.log('▶ TAREA 4 — Upserting precios (18 refs × 9 clientes)...\n');
    const rows = [];
    const now = Date.now();
    for (const [productRef, ...prices] of PRICE_TABLE) {
      CLIENT_KEYS.forEach((key, idx) => {
        rows.push({ clientId: CLIENT_ID[key], productRef, pricePerMeter: prices[idx], createdAt: now });
      });
    }
    console.log(`  Total filas: ${rows.length}\n`);

    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await db.from('ClientPrice').upsert(batch, { onConflict: 'clientId,productRef' });
      if (error) console.error(`  ✕ Batch ${Math.floor(i/50)+1} error:`, error.message);
      else console.log(`  ✓ Batch ${Math.floor(i/50)+1} (${batch.length} filas) OK`);
    }
    console.log('');
  }

  console.log('════════════════════════════════════════\n');
}

main().catch(console.error);
