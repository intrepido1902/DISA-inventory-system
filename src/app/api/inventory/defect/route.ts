import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

const ALLOWED_TYPES = ['WRITE_OFF', 'DEFECT_DISCOUNT', 'DEFECT_REPLACEMENT'] as const;
type DefectType = typeof ALLOWED_TYPES[number];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { rollId, type, notes } = body as { rollId?: number; type?: string; notes?: string };

    if (!rollId) return Response.json({ error: 'rollId es requerido' }, { status: 400 });
    if (!ALLOWED_TYPES.includes(type as DefectType)) {
      return Response.json({ error: 'Tipo inválido. Usa WRITE_OFF, DEFECT_DISCOUNT o DEFECT_REPLACEMENT' }, { status: 400 });
    }

    const dbAny = db as any;
    const rollRes: any = await dbAny.from('Roll').select('id, currentMeters, status').eq('id', Number(rollId)).single();
    if (rollRes.error || !rollRes.data) return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });

    const roll = rollRes.data;
    if (roll.status === 'WRITTEN_OFF' || roll.status === 'DEPLETED') {
      return Response.json({ error: 'El rollo no está disponible para reportar baja' }, { status: 400 });
    }

    const now = Date.now();

    const movRes: any = await dbAny.from('Movement').insert({
      type,
      rollId: Number(rollId),
      meters: roll.currentMeters,
      userId: session.userId,
      notes: notes?.trim() || null,
      barcodeUsed: 0,
      approvalStatus: 'PENDING',
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
    }).select('id').single();

    if (movRes.error) {
      console.error('Defect insert error:', movRes.error);
      return Response.json({ error: 'Error al registrar la baja' }, { status: 500 });
    }

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: `${type}_PENDING`,
      entity: 'Roll',
      entityId: Number(rollId),
      oldData: JSON.stringify({ status: roll.status, currentMeters: roll.currentMeters }),
      newData: JSON.stringify({ approvalStatus: 'PENDING', type }),
      createdAt: now,
    });

    return Response.json({ ok: true, movementId: movRes.data.id });
  } catch (err) {
    console.error('POST /api/inventory/defect error:', err);
    return Response.json({ error: 'Error al registrar la baja' }, { status: 500 });
  }
}
