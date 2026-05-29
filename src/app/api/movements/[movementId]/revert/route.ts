import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canRevertSale, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ movementId: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canRevertSale(session.role as Role)) {
    return Response.json({ error: 'Solo OWNER y ADMIN pueden revertir salidas' }, { status: 403 });
  }

  const { movementId } = await params;
  const movId = Number(movementId);
  if (isNaN(movId)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  const dbAny = db as any;

  try {
    // 1. Fetch the movement
    const movRes: any = await dbAny
      .from('Movement')
      .select('id, type, meters, rollId, reverted')
      .eq('id', movId)
      .single();

    if (movRes.error || !movRes.data) {
      return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    }

    const mov = movRes.data;

    if (Boolean(mov.reverted)) {
      return Response.json({ error: 'Este movimiento ya fue revertido' }, { status: 400 });
    }

    if (mov.type !== 'EXIT_FULL' && mov.type !== 'EXIT_PARTIAL') {
      return Response.json({ error: 'Solo se pueden revertir salidas' }, { status: 400 });
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

    // 3. Calculate new meters (cap at initialMeters)
    const newMeters = Math.min(initialMeters, currentMeters + metersToRestore);

    // 4. Recalculate status using Cambio 3 logic
    let newStatus: string;
    let newIsRemnant: number;
    if (newMeters === 0) {
      newStatus = 'DEPLETED'; newIsRemnant = 0;
    } else if (newMeters < initialMeters) {
      newStatus = 'REMNANT'; newIsRemnant = 1;
    } else {
      newStatus = 'ACTIVE'; newIsRemnant = 0;
    }

    const now = Date.now();

    // 5. Update roll
    await dbAny.from('Roll').update({
      currentMeters: newMeters,
      status: newStatus,
      isRemnant: newIsRemnant,
      updatedAt: now,
    }).eq('id', mov.rollId);

    // 6. Mark movement as reverted
    await dbAny.from('Movement').update({ reverted: true }).eq('id', movId);

    // 7. Create RETURN movement
    await dbAny.from('Movement').insert({
      type: 'RETURN',
      rollId: mov.rollId,
      meters: metersToRestore,
      userId: session.userId,
      saleId: null,
      notes: `Reversión del movimiento #${movId}`,
      barcodeUsed: 0,
      reverted: false,
      createdAt: now,
    });

    // 8. AuditLog
    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: 'REVERT_SALE',
      entity: 'Roll',
      entityId: mov.rollId,
      oldData: JSON.stringify({ currentMeters, status: roll.status }),
      newData: JSON.stringify({ currentMeters: newMeters, status: newStatus, revertedMovementId: movId }),
      createdAt: now,
    });

    return Response.json({ ok: true, newMeters, newStatus });
  } catch (err) {
    console.error('POST /api/movements/[movementId]/revert error:', err);
    return Response.json({ error: 'Error al revertir movimiento' }, { status: 500 });
  }
}
