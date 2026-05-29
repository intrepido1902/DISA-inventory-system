import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { rollId, meters, clientId, notes, exitType, pricePerMeter } = await request.json();

    if (!rollId || !clientId || !exitType) {
      return Response.json({ error: 'rollId, clientId y exitType son requeridos' }, { status: 400 });
    }
    if (exitType !== 'EXIT_FULL' && exitType !== 'EXIT_PARTIAL') {
      return Response.json({ error: 'exitType debe ser EXIT_FULL o EXIT_PARTIAL' }, { status: 400 });
    }
    const pricePerM = Number(pricePerMeter) || 0;
    if (pricePerM <= 0) {
      return Response.json({ error: 'El precio por metro debe ser mayor a 0' }, { status: 400 });
    }

    const dbAny = db as any;

    const rollRes: any = await dbAny
      .from('Roll')
      .select('id, currentMeters, initialMeters, status')
      .eq('id', Number(rollId))
      .single();

    if (rollRes.error || !rollRes.data) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const rd = rollRes.data;
    // Allow exit from ACTIVE or REMNANT rolls
    if (rd.status !== 'ACTIVE' && rd.status !== 'REMNANT') {
      return Response.json({ error: 'El rollo no está disponible para salida' }, { status: 400 });
    }

    const currentMeters = rd.currentMeters as number;

    let metersUsed: number;
    if (exitType === 'EXIT_FULL') {
      metersUsed = currentMeters;
    } else {
      const metersNum = Number(meters);
      if (isNaN(metersNum) || metersNum <= 0) {
        return Response.json({ error: 'Los metros deben ser un número positivo' }, { status: 400 });
      }
      if (metersNum > currentMeters) {
        return Response.json({ error: `Metros insuficientes. Disponibles: ${currentMeters}m` }, { status: 400 });
      }
      metersUsed = metersNum;
    }

    const newMeters = currentMeters - metersUsed;
    // Cambio 3: any cut → REMNANT (if meters remain), else DEPLETED
    const isRemnant = newMeters > 0 ? 1 : 0;
    const newStatus = newMeters === 0 ? 'DEPLETED' : 'REMNANT';
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const total = metersUsed * pricePerM;

    await dbAny.from('Roll').update({
      currentMeters: newMeters,
      status: newStatus,
      isRemnant,
      updatedAt: now,
    }).eq('id', Number(rollId));

    const saleRes: any = await dbAny.from('Sale').insert({
      clientId: Number(clientId),
      date: today,
      total,
      createdAt: now,
    }).select('id').single();

    const saleId = saleRes.data?.id;

    const movRes: any = await dbAny.from('Movement').insert({
      type: exitType,
      rollId: Number(rollId),
      meters: metersUsed,
      userId: session.userId,
      saleId,
      notes: notes ?? null,
      barcodeUsed: 0,
      createdAt: now,
    }).select('id').single();

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: exitType,
      entity: 'Roll',
      entityId: Number(rollId),
      oldData: JSON.stringify({ currentMeters }),
      newData: JSON.stringify({ currentMeters: newMeters, status: newStatus, pricePerMeter: pricePerM }),
      createdAt: now,
    });

    return Response.json({
      ok: true,
      movementId: movRes.data?.id,
      newMeters,
      newStatus,
      isRemnant: isRemnant === 1,
    });
  } catch (err) {
    console.error('POST /api/inventory/exit error:', err);
    return Response.json({ error: 'Error al registrar salida' }, { status: 500 });
  }
}
