import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') return Response.json({ error: 'Solo el socio puede quitar la marca de defecto' }, { status: 403 });

  const { id } = await params;
  const rollIdNum = Number(id);
  if (isNaN(rollIdNum)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const dbAny = db as any;
    const now = Date.now();

    await dbAny.from('Roll').update({
      hasDefect: false,
      defectNote: null,
      defectDiscountPct: null,
      updatedAt: now,
    }).eq('id', rollIdNum);

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: 'DEFECT_CLEARED',
      entity: 'Roll',
      entityId: rollIdNum,
      oldData: JSON.stringify({ hasDefect: true }),
      newData: JSON.stringify({ hasDefect: false }),
      createdAt: now,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('POST clear-defect error:', err);
    return Response.json({ error: 'Error al limpiar la marca de defecto' }, { status: 500 });
  }
}
