import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ movementId: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') return Response.json({ error: 'Solo el socio puede aprobar bajas' }, { status: 403 });

  const { movementId } = await params;
  const movIdNum = Number(movementId);
  if (isNaN(movIdNum)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const dbAny = db as any;
    const movRes: any = await dbAny.from('Movement')
      .select('id, type, rollId, meters, approvalStatus')
      .eq('id', movIdNum)
      .single();

    if (movRes.error || !movRes.data) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    const mov = movRes.data;

    if (mov.approvalStatus !== 'PENDING') {
      return Response.json({ error: 'Solo se pueden aprobar movimientos pendientes' }, { status: 400 });
    }

    const now = Date.now();

    await dbAny.from('Movement').update({
      approvalStatus: 'APPROVED',
      approvedBy: session.userId,
      approvedAt: now,
    }).eq('id', movIdNum);

    // Update Roll based on movement type
    if (mov.type === 'WRITE_OFF') {
      const rollRes: any = await dbAny.from('Roll').select('currentMeters').eq('id', mov.rollId).single();
      const prev = rollRes.data?.currentMeters ?? 0;
      const newMeters = Math.max(0, prev - mov.meters);
      await dbAny.from('Roll').update({
        status: 'WRITTEN_OFF',
        currentMeters: newMeters,
        isRemnant: 0,
        updatedAt: now,
      }).eq('id', mov.rollId);
    } else if (mov.type === 'DEFECT_REPLACEMENT') {
      await dbAny.from('Roll').update({
        status: 'DEFECTIVE',
        updatedAt: now,
      }).eq('id', mov.rollId);
    }
    // DEFECT_DISCOUNT: no Roll status change

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: `${mov.type}_APPROVED`,
      entity: 'Roll',
      entityId: mov.rollId,
      oldData: JSON.stringify({ approvalStatus: 'PENDING' }),
      newData: JSON.stringify({ approvalStatus: 'APPROVED', approvedBy: session.userId }),
      createdAt: now,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('POST approve error:', err);
    return Response.json({ error: 'Error al aprobar la baja' }, { status: 500 });
  }
}
