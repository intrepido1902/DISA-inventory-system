import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ movementId: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') return Response.json({ error: 'Solo el socio puede rechazar bajas' }, { status: 403 });

  const { movementId } = await params;
  const movIdNum = Number(movementId);
  if (isNaN(movIdNum)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const dbAny = db as any;
    const movRes: any = await dbAny.from('Movement')
      .select('id, rollId, approvalStatus, type')
      .eq('id', movIdNum)
      .single();

    if (movRes.error || !movRes.data) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    const mov = movRes.data;

    if (mov.approvalStatus !== 'PENDING') {
      return Response.json({ error: 'Solo se pueden rechazar movimientos pendientes' }, { status: 400 });
    }

    const now = Date.now();

    await dbAny.from('Movement').update({
      approvalStatus: 'REJECTED',
      approvedBy: session.userId,
      approvedAt: now,
    }).eq('id', movIdNum);

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: `${mov.type}_REJECTED`,
      entity: 'Roll',
      entityId: mov.rollId,
      oldData: JSON.stringify({ approvalStatus: 'PENDING' }),
      newData: JSON.stringify({ approvalStatus: 'REJECTED', approvedBy: session.userId }),
      createdAt: now,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('POST reject error:', err);
    return Response.json({ error: 'Error al rechazar la baja' }, { status: 500 });
  }
}
