import { db } from './db';

const EXIT_ACTIONS = new Set(['EXIT_FULL', 'EXIT_PARTIAL']);

export interface AuditLogBase {
  action: string;
  entityId: number;
  // Postgres bigint columns can come back from PostgREST/supabase-js as JSON strings (to avoid
  // precision loss above Number.MAX_SAFE_INTEGER), so this isn't guaranteed to be a `number`
  // at runtime even though it usually is — always Number(...) it before doing arithmetic.
  createdAt: number | string;
}

export interface AuditLogEnrichment {
  clientName: string | null;
  saleTotal: number | null;
  voided: boolean;
}

interface MovementCandidate {
  createdAt: number | string;
  reverted: boolean;
  clientName: string | null;
  saleTotal: number | null;
}

/**
 * AuditLog does not store clientName/total for EXIT_FULL / EXIT_PARTIAL rows — that data lives
 * on the Sale record. For these actions `entityId` is the rollId (not the movementId — see
 * ReprintButtons in audit/client.tsx), so we join Movement (rollId = entityId) → Sale
 * (Movement.saleId = Sale.id) to recover Sale.clientName and Sale.total, and read
 * Movement.reverted to know whether the exit has since been voided (no schema changes needed).
 *
 * A roll can have been sold more than once over its lifetime, so a rollId alone doesn't uniquely
 * identify the Movement — we disambiguate by picking, among all EXIT movements for that roll,
 * the one whose createdAt is closest to the AuditLog row's createdAt (in practice this is an
 * exact match, since /api/inventory/exit writes the Roll update, the Movement row and the
 * AuditLog row using the same Date.now() value for a given request).
 */
export async function enrichAuditLogs<T extends AuditLogBase>(
  logs: T[],
): Promise<(T & AuditLogEnrichment)[]> {
  const exitRollIds = [...new Set(
    logs.filter(l => EXIT_ACTIONS.has(l.action)).map(l => l.entityId)
  )];

  const candidatesByRoll = new Map<number, MovementCandidate[]>();

  if (exitRollIds.length > 0) {
    const dbAny = db as any;
    const { data: movs, error } = await dbAny
      .from('Movement')
      .select('rollId, createdAt, sale:saleId(clientName, total)')
      .in('rollId', exitRollIds)
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL']);

    if (error) console.error('[auditEnrich] Movement/Sale join error:', error);

    for (const m of movs ?? []) {
      const rollId = m.rollId as number;
      const list = candidatesByRoll.get(rollId) ?? [];
      list.push({
        createdAt: m.createdAt as number | string,
        reverted: Boolean(m.reverted),
        clientName: m.sale?.clientName ?? null,
        saleTotal: m.sale?.total != null ? Number(m.sale.total) : null,
      });
      candidatesByRoll.set(rollId, list);
    }
  }

  // Matches are only trusted within this window of the AuditLog row's createdAt. In practice
  // both are written from the same Date.now() value in the same request, so the real diff is
  // 0 — this just guards against ever attaching an unrelated sale to a log row.
  const MATCH_THRESHOLD_MS = 5000;

  const result = logs.map(l => {
    if (!EXIT_ACTIONS.has(l.action)) {
      return { ...l, clientName: null, saleTotal: null, voided: false };
    }

    const candidates = candidatesByRoll.get(l.entityId) ?? [];
    const logCreatedAt = Number(l.createdAt);
    let best: MovementCandidate | null = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      // Defensive Number() coercion: some Postgres bigint/numeric columns can come back from
      // PostgREST as JSON strings rather than numbers, which would otherwise make this diff
      // silently wrong (or NaN, if either side were non-numeric/undefined).
      const diff = Math.abs(Number(c.createdAt) - logCreatedAt);
      if (diff < bestDiff) { bestDiff = diff; best = c; }
    }
    // Reject matches outside the trust window — better to show "—" than the wrong sale.
    const matched = best !== null && bestDiff <= MATCH_THRESHOLD_MS ? best : null;

    return {
      ...l,
      clientName: matched?.clientName ?? null,
      saleTotal: matched?.saleTotal ?? null,
      voided: matched?.reverted ?? false,
    };
  });

  console.log('[enrichAuditLogs] sample:', JSON.stringify(result.slice(0, 2).map((r: any) => ({ id: r.id, clientName: r.clientName, saleTotal: r.saleTotal }))));

  return result;
}
