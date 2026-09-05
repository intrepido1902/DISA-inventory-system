import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import type { Role } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/audit/void
// Body: { rollId: number, createdAt: number, reason: string }
//
// Anula (void) an EXIT_FULL / EXIT_PARTIAL movement from the audit trail:
//   1. Locates the originating Movement via rollId + createdAt (same technique used by
//      /api/audit/reprint — AuditLog.entityId is the rollId for EXIT actions, and both rows
//      are written with the same Date.now() value).
//   2. Restores the sold meters back onto the Roll and recomputes its status
//      (mirrors the logic in /api/movements/[movementId]/revert).
//   3. Marks the original Movement as anulado by reusing the existing `reverted` boolean
//      column (Movement.reverted already exists in the schema — no new columns needed).
//   4. Inserts a brand-new AuditLog row with action VOID_MOVEMENT carrying the reason,
//      who voided it (userId) and when (createdAt). The original EXIT_FULL/EXIT_PARTIAL
//      AuditLog row is never modified — it stays in the history as-is.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const role = session.role as Role;
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return Response.json({ error: 'Solo OWNER y ADMIN pueden anular movimientos' }, { status: 403 });
  }

  const dbAny = db as any;

  try {
    const body = await request.json();
    const { rollId, createdAt, reason } = body as {
      rollId: number; createdAt: number; reason: string;
    };

    if (!rollId || !createdAt) {
      return Response.json({ error: 'rollId y createdAt son requeridos' }, { status: 400 });
    }

    const trimmedReason = (reason ?? '').trim();
    if (trimmedReason.length < 10) {
      return Response.json({ error: 'La razón de anulación debe tener al menos 10 caracteres' }, { status: 400 });
    }

    // 1. Locate the Movement (exact timestamp match, ±10s fallback — same as /api/audit/reprint)
    const exactRes: any = await dbAny
      .from('Movement')
      .select('id, type, meters, rollId, saleId, reverted')
      .eq('rollId', rollId)
      .eq('createdAt', createdAt)
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .maybeSingle();

    let mov = exactRes.data;

    if (!mov) {
      const { data: rows } = await dbAny
        .from('Movement')
        .select('id, type, meters, rollId, saleId, reverted')
        .eq('rollId', rollId)
        .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
        .gte('createdAt', createdAt - 10_000)
        .lte('createdAt', createdAt + 10_000)
        .order('createdAt', { ascending: true })
        .limit(1);
      mov = rows?.[0] ?? null;
    }

    if (!mov) {
      return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    }
    if (mov.reverted) {
      return Response.json({ error: 'Este movimiento ya fue anulado' }, { status: 400 });
    }

    // 2. Fetch the roll (need initialMeters to recalculate status)
    const rollRes: any = await dbAny
      .from('Roll')
      .select('id, currentMeters, initialMeters, status')
      .eq('id', mov.rollId)
      .single();

    if (rollRes.error || !rollRes.data) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const roll = rollRes.data;
    const currentMeters = roll.currentMeters as number;
    const initialMeters = roll.initialMeters as number;
    const metersToRestore = mov.meters as number;

    // 3. Restore meters (cap at initialMeters) and recompute status
    const newMeters = Math.min(initialMeters, currentMeters + metersToRestore);
    let newStatus: string;
    let newIsRemnant: number;
    if (newMeters === 0) {
      newStatus = 'DEPLETED'; newIsRemnant = 0;
    } else if (newMeters < initialMeters) {
      newStatus = 'REMNANT'; newIsRemnant = 1;
    } else {
      // e.g. a full EXIT_FULL on a DEPLETED roll gets fully restored → back to ACTIVE
      newStatus = 'ACTIVE'; newIsRemnant = 0;
    }

    const now = Date.now();

    // 4. Update Roll
    await dbAny.from('Roll').update({
      currentMeters: newMeters,
      status: newStatus,
      isRemnant: newIsRemnant,
      updatedAt: now,
    }).eq('id', mov.rollId);

    // 5. Mark the original Movement as anulado (existing `reverted` column, no schema change)
    await dbAny.from('Movement').update({ reverted: true }).eq('id', mov.id);

    // 6. New AuditLog entry — the original EXIT_FULL/EXIT_PARTIAL row is left untouched
    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: 'VOID_MOVEMENT',
      entity: 'Movement',
      entityId: mov.id,
      oldData: JSON.stringify({ currentMeters, status: roll.status, reverted: false }),
      newData: JSON.stringify({
        currentMeters: newMeters,
        status: newStatus,
        reverted: true,
        reason: trimmedReason,
        voidedMovementId: mov.id,
        voidedRollId: mov.rollId,
      }),
      createdAt: now,
    });

    return Response.json({ ok: true, newMeters, newStatus });
  } catch (err) {
    console.error('POST /api/audit/void error:', err);
    return Response.json({ error: 'Error al anular movimiento' }, { status: 500 });
  }
}
