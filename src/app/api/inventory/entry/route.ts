import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canManageInventory, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canManageInventory(session.role as Role)) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  try {
    const { rollNumber, productId, lotId, initialMeters, location, barcode, disaNumber } = await request.json();

    if (!rollNumber || !productId || !lotId || !initialMeters || !location) {
      return Response.json({ error: 'Todos los campos son requeridos excepto barcode y disaNumber' }, { status: 400 });
    }

    const meters = Number(initialMeters);
    if (isNaN(meters) || meters <= 0) {
      return Response.json({ error: 'Los metros iniciales deben ser positivos' }, { status: 400 });
    }

    const now = Date.now();
    const dbAny = db as any;

    const { data: rollData, error: rollError } = await dbAny.from('Roll').insert({
      rollNumber: String(rollNumber),
      barcode: barcode ? String(barcode) : null,
      disaNumber: disaNumber ? String(disaNumber).trim() : null,
      productId: Number(productId),
      lotId: Number(lotId),
      initialMeters: meters,
      currentMeters: meters,
      location: String(location),
      status: 'ACTIVE',
      isRemnant: 0,
      createdAt: now,
      updatedAt: now,
    }).select('id').single();

    if (rollError) {
      if (rollError.message?.includes('unique') || rollError.code === '23505') {
        return Response.json({ error: 'El barcode o consecutivo DISA ya existe' }, { status: 409 });
      }
      throw rollError;
    }

    const newRollId = rollData.id;

    await dbAny.from('Movement').insert({
      type: 'ENTRY',
      rollId: newRollId,
      meters,
      userId: session.userId,
      saleId: null,
      notes: 'Entrada de importación',
      barcodeUsed: 0,
      createdAt: now,
    });

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: 'ENTRY',
      entity: 'Roll',
      entityId: newRollId,
      oldData: null,
      newData: JSON.stringify({ rollNumber, disaNumber, productId, lotId, initialMeters: meters }),
      createdAt: now,
    });

    return Response.json({ ok: true, rollId: newRollId }, { status: 201 });
  } catch (err) {
    console.error('POST /api/inventory/entry error:', err);
    return Response.json({ error: 'Error al registrar entrada' }, { status: 500 });
  }
}
