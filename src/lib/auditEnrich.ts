import { db } from './db';

const EXIT_ACTIONS = new Set(['EXIT_FULL', 'EXIT_PARTIAL']);

export interface AuditLogBase {
  action: string;
  entity: string;
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
  // Human-readable Roll identifiers for logs whose entity is 'Roll' — entityId alone is just
  // the internal Roll.id and means nothing to a user. Null for non-Roll entities, or if the
  // Roll row could not be found (e.g. it was later deleted).
  rollConsecutivo: string | null;
  rollDisaNumber: string | null;
  rollReference: string | null;
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

  // Batch-fetch Roll(rollNumber, disaNumber) for every log whose entity is 'Roll', in one query,
  // so the table can show the human-readable consecutivo/No. Rollo instead of the raw Roll.id.
  const rollEntityIds = [...new Set(
    logs.filter(l => l.entity === 'Roll').map(l => l.entityId)
  )];

  const rollById = new Map<number, { rollNumber: string | null; disaNumber: string | null; reference: string | null }>();

  if (rollEntityIds.length > 0) {
    const dbAny = db as any;
    const { data: rolls, error } = await dbAny
      .from('Roll')
      .select('id, rollNumber, disaNumber, product:productId(code)')
      .in('id', rollEntityIds);

    if (error) console.error('[auditEnrich] Roll lookup error:', error);

    for (const r of rolls ?? []) {
      rollById.set(r.id as number, {
        rollNumber: r.rollNumber ?? null,
        disaNumber: r.disaNumber ?? null,
        reference: (r.product as any)?.code ?? null,
      });
    }
  }

  if (exitRollIds.length > 0) {
    const dbAny = db as any;
    const { data: movs, error } = await dbAny
      .from('Movement')
      .select('rollId, createdAt, reverted, sale:saleId(clientName, total)')
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

  // Legacy VOID_MOVEMENT rows — created before the void route was fixed to log
  // entity: 'Roll' + entityId: rollId — still have entity === 'Movement' and
  // entityId === movementId. Resolve their roll/client info the long way: movementId →
  // (rollId, saleId) → Roll / Sale. Purely additive: doesn't affect entity === 'Roll' rows.
  const movementInfoById = new Map<number, { rollId: number | null; saleId: number | null }>();
  const legacyVoidClientByMovement = new Map<number, string | null>();

  const legacyVoidMovementIds = [...new Set(
    logs.filter(l => l.action === 'VOID_MOVEMENT' && l.entity === 'Movement').map(l => l.entityId)
  )];

  if (legacyVoidMovementIds.length > 0) {
    const dbAny = db as any;
    const { data: movRows, error: movErr } = await dbAny
      .from('Movement')
      .select('id, rollId, saleId')
      .in('id', legacyVoidMovementIds);

    if (movErr) console.error('[auditEnrich] Legacy VOID_MOVEMENT Movement lookup error:', movErr);

    for (const m of movRows ?? []) {
      movementInfoById.set(m.id as number, {
        rollId: m.rollId ?? null,
        saleId: m.saleId ?? null,
      });
    }

    // Merge into the same rollById map used for entity === 'Roll' rows, keyed by Roll.id.
    const legacyRollIds = [...new Set(
      [...movementInfoById.values()].map(v => v.rollId).filter((id): id is number => id !== null)
    )];
    if (legacyRollIds.length > 0) {
      const { data: rolls, error: rollErr } = await dbAny
        .from('Roll')
        .select('id, rollNumber, disaNumber, product:productId(code)')
        .in('id', legacyRollIds);

      if (rollErr) console.error('[auditEnrich] Legacy VOID_MOVEMENT Roll lookup error:', rollErr);

      for (const r of rolls ?? []) {
        rollById.set(r.id as number, {
          rollNumber: r.rollNumber ?? null,
          disaNumber: r.disaNumber ?? null,
          reference: (r.product as any)?.code ?? null,
        });
      }
    }

    const legacySaleIds = [...new Set(
      [...movementInfoById.values()].map(v => v.saleId).filter((id): id is number => id !== null)
    )];
    if (legacySaleIds.length > 0) {
      const { data: sales, error: saleErr } = await dbAny
        .from('Sale')
        .select('id, clientName')
        .in('id', legacySaleIds);

      if (saleErr) console.error('[auditEnrich] Legacy VOID_MOVEMENT Sale lookup error:', saleErr);

      const saleClientById = new Map<number, string | null>();
      for (const s of sales ?? []) saleClientById.set(s.id as number, s.clientName ?? null);

      for (const [movId, info] of movementInfoById) {
        if (info.saleId !== null) legacyVoidClientByMovement.set(movId, saleClientById.get(info.saleId) ?? null);
      }
    }
  }

  // Matches are only trusted within this window of the AuditLog row's createdAt. In practice
  // both are written from the same Date.now() value in the same request, so the real diff is
  // 0 — this just guards against ever attaching an unrelated sale to a log row.
  const MATCH_THRESHOLD_MS = 5000;

  const result = logs.map(l => {
    // Legacy VOID_MOVEMENT: entity is 'Movement' and entityId is the movementId — resolve
    // roll/client info indirectly via movementInfoById instead of treating entityId as a
    // Roll.id.
    const isLegacyVoidMovement = l.action === 'VOID_MOVEMENT' && l.entity === 'Movement';
    const legacyMovementInfo = isLegacyVoidMovement ? movementInfoById.get(l.entityId) : undefined;

    const rollInfo = l.entity === 'Roll'
      ? rollById.get(l.entityId)
      : legacyMovementInfo?.rollId != null
        ? rollById.get(legacyMovementInfo.rollId)
        : undefined;
    const rollConsecutivo = rollInfo?.rollNumber ?? null;
    const rollDisaNumber = rollInfo?.disaNumber ?? null;
    const rollReference = rollInfo?.reference ?? null;

    if (!EXIT_ACTIONS.has(l.action)) {
      const legacyClientName = isLegacyVoidMovement ? legacyVoidClientByMovement.get(l.entityId) ?? null : null;
      return { ...l, clientName: legacyClientName, saleTotal: null, voided: false, rollConsecutivo, rollDisaNumber, rollReference };
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
      rollConsecutivo,
      rollDisaNumber,
      rollReference,
    };
  });

  console.log('[enrichAuditLogs] sample:', JSON.stringify(result.slice(0, 2).map((r: any) => ({ id: r.id, clientName: r.clientName, saleTotal: r.saleTotal }))));

  return result;
}
