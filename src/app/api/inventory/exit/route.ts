import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

interface RollPayload {
  rollId: number;
  exitType: 'EXIT_FULL' | 'EXIT_PARTIAL';
  meters: number;
  pricePerMeter: number;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { clientId, clientName: bodyClientName, discount, notes, rolls } = body as {
      clientId: number;
      clientName?: string | null;
      discount?: number;
      notes?: string | null;
      rolls: RollPayload[];
    };

    if (!clientId) return Response.json({ error: 'clientId es requerido' }, { status: 400 });
    if (!Array.isArray(rolls) || rolls.length === 0) {
      return Response.json({ error: 'rolls debe ser un array no vacío' }, { status: 400 });
    }

    const discountPct = Math.max(0, Math.min(100, Number(discount) || 0));

    for (const r of rolls) {
      if (!r.rollId || !r.exitType) {
        return Response.json({ error: 'Cada rollo requiere rollId y exitType' }, { status: 400 });
      }
      if (r.exitType !== 'EXIT_FULL' && r.exitType !== 'EXIT_PARTIAL') {
        return Response.json({ error: `exitType inválido para rollo ${r.rollId}` }, { status: 400 });
      }
      if (Number(r.pricePerMeter) <= 0) {
        return Response.json({ error: `Precio inválido para rollo ${r.rollId}` }, { status: 400 });
      }
    }

    const dbAny = db as any;

    const clientRes: any = await dbAny.from('Client').select('name, type').eq('id', Number(clientId)).single();
    const clientName: string | null = clientRes.data?.name ?? null;
    const clientType: string | null = clientRes.data?.type ?? null;

    const isGeneral = clientType === 'GENERAL';
    if (isGeneral && !bodyClientName?.trim()) {
      return Response.json({ error: 'El nombre de la persona es requerido para Cliente General' }, { status: 400 });
    }
    const effectiveClientName = isGeneral ? (bodyClientName?.trim() ?? clientName) : clientName;

    const rollIds = rolls.map(r => Number(r.rollId));
    const rollsRes: any = await dbAny.from('Roll').select('id, currentMeters, status').in('id', rollIds);
    if (rollsRes.error) return Response.json({ error: 'Error al obtener rollos' }, { status: 500 });

    const rollMap = new Map<number, { currentMeters: number; status: string }>();
    for (const rd of rollsRes.data ?? []) {
      rollMap.set(rd.id as number, { currentMeters: rd.currentMeters as number, status: rd.status as string });
    }

    for (const r of rolls) {
      const rd = rollMap.get(Number(r.rollId));
      if (!rd) return Response.json({ error: `Rollo ${r.rollId} no encontrado` }, { status: 404 });
      if (rd.status !== 'ACTIVE' && rd.status !== 'REMNANT') {
        return Response.json({ error: `Rollo ${r.rollId} no está disponible` }, { status: 400 });
      }
      if (r.exitType === 'EXIT_PARTIAL') {
        const m = Number(r.meters);
        if (isNaN(m) || m <= 0) {
          return Response.json({ error: `Metros inválidos para rollo ${r.rollId}` }, { status: 400 });
        }
        if (m > rd.currentMeters) {
          return Response.json({ error: `Metros insuficientes en rollo ${r.rollId} (disponible: ${rd.currentMeters}m)` }, { status: 400 });
        }
      }
    }

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    let subtotal = 0;
    const rollCalcs = rolls.map(r => {
      const rd = rollMap.get(Number(r.rollId))!;
      const metersUsed = r.exitType === 'EXIT_FULL' ? rd.currentMeters : Number(r.meters);
      const pricePerM = Number(r.pricePerMeter);
      const rowSubtotal = metersUsed * pricePerM;
      subtotal += rowSubtotal;
      const newMeters = rd.currentMeters - metersUsed;
      const newStatus = newMeters === 0 ? 'DEPLETED' : 'REMNANT';
      const isRemnant = newMeters > 0 ? 1 : 0;
      return { r, rd, metersUsed, pricePerM, rowSubtotal, newMeters, newStatus, isRemnant };
    });

    const discountAmount = subtotal * (discountPct / 100);
    const total = subtotal - discountAmount;

    const saleRes: any = await dbAny.from('Sale').insert({
      clientId: Number(clientId),
      clientName: effectiveClientName,
      date: today,
      subtotal,
      discount: discountPct,
      total,
      createdAt: now,
    }).select('id').single();

    if (saleRes.error) {
      console.error('Sale insert error:', saleRes.error);
      return Response.json({ error: 'Error al crear la venta' }, { status: 500 });
    }
    const saleId = saleRes.data.id;

    const movementIds: number[] = [];
    const rollUpdates: Array<{ rollId: number; newMeters: number; newStatus: string; isRemnant: boolean }> = [];

    for (const calc of rollCalcs) {
      await dbAny.from('Roll').update({
        currentMeters: calc.newMeters,
        status: calc.newStatus,
        isRemnant: calc.isRemnant,
        updatedAt: now,
      }).eq('id', Number(calc.r.rollId));

      const movRes: any = await dbAny.from('Movement').insert({
        type: calc.r.exitType,
        rollId: Number(calc.r.rollId),
        meters: calc.metersUsed,
        userId: session.userId,
        saleId,
        notes: notes ?? null,
        barcodeUsed: 0,
        pricePerMeter: calc.pricePerM,
        discount: discountPct,
        total: calc.rowSubtotal * (1 - discountPct / 100),
        createdAt: now,
      }).select('id').single();

      if (movRes.data?.id) movementIds.push(movRes.data.id);

      rollUpdates.push({
        rollId: Number(calc.r.rollId),
        newMeters: calc.newMeters,
        newStatus: calc.newStatus,
        isRemnant: calc.isRemnant === 1,
      });

      await dbAny.from('AuditLog').insert({
        userId: session.userId,
        action: calc.r.exitType,
        entity: 'Roll',
        entityId: Number(calc.r.rollId),
        oldData: JSON.stringify({ currentMeters: calc.rd.currentMeters }),
        newData: JSON.stringify({ currentMeters: calc.newMeters, status: calc.newStatus, pricePerMeter: calc.pricePerM, discount: discountPct }),
        createdAt: now,
      });
    }

    return Response.json({
      ok: true,
      saleId,
      movementIds,
      clientName: effectiveClientName,
      clientType,
      subtotal,
      discount: discountPct,
      total,
      rollUpdates,
    });
  } catch (err) {
    console.error('POST /api/inventory/exit error:', err);
    return Response.json({ error: 'Error al registrar salida' }, { status: 500 });
  }
}
