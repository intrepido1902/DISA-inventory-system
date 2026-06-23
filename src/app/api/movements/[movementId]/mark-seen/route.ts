import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ movementId: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { movementId } = await params;
  const movIdNum = Number(movementId);
  if (isNaN(movIdNum)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const dbAny = db as any;
    const movRes: any = await dbAny
      .from('Movement')
      .select('id, userId, approvalStatus')
      .eq('id', movIdNum)
      .single();

    if (movRes.error || !movRes.data) return Response.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    const mov = movRes.data;

    if (mov.userId !== session.userId) {
      return Response.json({ error: 'No autorizado' }, { status: 403 });
    }
    if (mov.approvalStatus !== 'REJECTED') {
      return Response.json({ error: 'Solo aplica a movimientos rechazados' }, { status: 400 });
    }

    await dbAny.from('Movement').update({ rejectionSeen: true }).eq('id', movIdNum);

    return Response.json({ ok: true });
  } catch (err) {
    console.error('POST mark-seen error:', err);
    return Response.json({ error: 'Error al marcar como visto' }, { status: 500 });
  }
}
