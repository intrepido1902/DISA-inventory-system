import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canManageInventory, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

// Manual single-roll entry — OWNER/ADMIN only. Distinct from /api/inventory/entry
// (bulk import against a real ImportLot with barcode/disaNumber): here the lot is
// resolved automatically and rollNumber uniqueness is enforced at the app level,
// since the DB has no unique constraint on Roll.rollNumber.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canManageInventory(session.role as Role)) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  try {
    const { rollNumber, productId, initialMeters, location, hasDefect } = await request.json();

    const rollNum = String(rollNumber ?? '').trim();
    if (!rollNum || !productId || !initialMeters) {
      return Response.json({ error: 'Consecutivo, referencia y metros iniciales son requeridos' }, { status: 400 });
    }

    const meters = Number(initialMeters);
    if (isNaN(meters) || meters <= 0) {
      return Response.json({ error: 'Los metros iniciales deben ser un número positivo' }, { status: 400 });
    }

    const loc = String(location ?? '').trim() || 'Bodega';
    const dbAny = db as any;

    // rollNumber (consecutivo) must be unique — no DB-level constraint enforces this
    const dupRes: any = await dbAny.from('Roll').select('id').eq('rollNumber', rollNum).limit(1);
    if (dupRes.error) throw dupRes.error;
    if ((dupRes.data ?? []).length > 0) {
      return Response.json({ error: `El consecutivo "${rollNum}" ya existe` }, { status: 409 });
    }

    // Resolve lotId: most recent ImportLot, or create a 'MANUAL' one if none exists yet
    const lotRes: any = await dbAny.from('ImportLot').select('id').order('createdAt', { ascending: false }).limit(1);
    if (lotRes.error) throw lotRes.error;

    let lotId: number;
    if ((lotRes.data ?? []).length > 0) {
      lotId = lotRes.data[0].id;
    } else {
      const bootstrapNow = Date.now();
      const newLotRes: any = await dbAny.from('ImportLot').insert({
        lotNumber: 'MANUAL',
        importDate: new Date(bootstrapNow).toISOString().slice(0, 10),
        createdAt: bootstrapNow,
      }).select('id').single();
      if (newLotRes.error) throw newLotRes.error;
      lotId = newLotRes.data.id;
    }

    const now = Date.now();
    const rollRes: any = await dbAny.from('Roll').insert({
      rollNumber: rollNum,
      disaNumber: null,
      productId: Number(productId),
      lotId,
      initialMeters: meters,
      currentMeters: meters,
      location: loc,
      status: 'ACTIVE',
      isRemnant: 0,
      hasDefect: Boolean(hasDefect),
      createdAt: now,
      updatedAt: now,
    }).select('id').single();

    if (rollRes.error) throw rollRes.error;
    const newRollId = rollRes.data.id as number;

    await dbAny.from('Movement').insert({
      type: 'ENTRY',
      rollId: newRollId,
      meters,
      userId: session.userId,
      notes: 'Ingreso manual de rollo',
      barcodeUsed: 0,
      createdAt: now,
    });

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: 'MANUAL_ENTRY',
      entity: 'Roll',
      entityId: newRollId,
      oldData: null,
      newData: JSON.stringify({
        rollNumber: rollNum, productId: Number(productId), lotId,
        initialMeters: meters, location: loc, hasDefect: Boolean(hasDefect),
      }),
      createdAt: now,
    });

    return Response.json({ ok: true, rollId: newRollId }, { status: 201 });
  } catch (err) {
    console.error('POST /api/inventory/manual error:', err);
    return Response.json({ error: 'Error al agregar el rollo' }, { status: 500 });
  }
}
