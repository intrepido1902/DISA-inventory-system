import { db } from './db';

const EXIT_ACTIONS = new Set(['EXIT_FULL', 'EXIT_PARTIAL']);

export interface AuditLogBase {
  action: string;
  entityId: number;
  createdAt: number;
}

export interface AuditLogEnrichment {
  clientName: string | null;
  saleTotal: number | null;
  voided: boolean;
}

/**
 * For EXIT_FULL / EXIT_PARTIAL AuditLog rows, `entityId` is the rollId (not the movementId —
 * see ReprintButtons in audit/client.tsx) and `createdAt` matches the originating Movement's
 * `createdAt` exactly, because /api/inventory/exit writes the Roll update, the Movement row and
 * the AuditLog row using the same `Date.now()` value. That lets us join back to
 * Movement → Sale (for the client name + collected value) and read Movement.reverted (to know
 * whether this exit has since been voided) without any schema changes.
 */
export async function enrichAuditLogs<T extends AuditLogBase>(
  logs: T[],
): Promise<(T & AuditLogEnrichment)[]> {
  const exitRollIds = [...new Set(
    logs.filter(l => EXIT_ACTIONS.has(l.action)).map(l => l.entityId)
  )];

  const movMap = new Map<string, AuditLogEnrichment>();

  if (exitRollIds.length > 0) {
    const dbAny = db as any;
    const { data: movs, error } = await dbAny
      .from('Movement')
      .select('rollId, meters, pricePerMeter, discount, total, createdAt, reverted, sale:saleId(clientName)')
      .in('rollId', exitRollIds)
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL']);

    if (error) console.error('[auditEnrich] Movement join error:', error);

    for (const m of movs ?? []) {
      const meters = Number(m.meters) || 0;
      const pricePerMeter = Number(m.pricePerMeter) || 0;
      const discount = Number(m.discount) || 0;
      const total = m.total != null ? Number(m.total) : meters * pricePerMeter * (1 - discount / 100);
      movMap.set(`${m.rollId}_${m.createdAt}`, {
        clientName: m.sale?.clientName ?? null,
        saleTotal: total,
        voided: Boolean(m.reverted),
      });
    }
  }

  return logs.map(l => {
    if (!EXIT_ACTIONS.has(l.action)) {
      return { ...l, clientName: null, saleTotal: null, voided: false };
    }
    const match = movMap.get(`${l.entityId}_${l.createdAt}`);
    return {
      ...l,
      clientName: match?.clientName ?? null,
      saleTotal: match?.saleTotal ?? null,
      voided: match?.voided ?? false,
    };
  });
}
