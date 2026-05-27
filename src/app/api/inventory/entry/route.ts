import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canManageInventory } from '@/lib/auth';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canManageInventory(session.role as 'OWNER' | 'WAREHOUSE')) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  try {
    const { rollNumber, productId, lotId, initialMeters, location, barcode } = await request.json();

    if (!rollNumber || !productId || !lotId || !initialMeters || !location) {
      return Response.json({ error: 'Todos los campos son requeridos excepto barcode' }, { status: 400 });
    }

    const meters = Number(initialMeters);
    if (isNaN(meters) || meters <= 0) {
      return Response.json({ error: 'Los metros iniciales deben ser positivos' }, { status: 400 });
    }

    const now = Date.now();

    const rollResult = await db.execute({
      sql: `INSERT INTO Roll (rollNumber, barcode, productId, lotId, initialMeters, currentMeters, location, status, isRemnant, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?)`,
      args: [
        String(rollNumber),
        barcode ? String(barcode) : null,
        Number(productId),
        Number(lotId),
        meters,
        meters,
        String(location),
        now,
        now,
      ],
    });

    const newRollId = Number(rollResult.lastInsertRowid);

    await db.execute({
      sql: `INSERT INTO Movement (type, rollId, meters, userId, saleId, notes, barcodeUsed, createdAt)
            VALUES ('ENTRY', ?, ?, ?, null, 'Entrada de importación', 0, ?)`,
      args: [newRollId, meters, session.userId, now],
    });

    await db.execute({
      sql: `INSERT INTO AuditLog (userId, action, entity, entityId, oldData, newData, createdAt)
            VALUES (?, 'ENTRY', 'Roll', ?, null, ?, ?)`,
      args: [session.userId, newRollId, JSON.stringify({ rollNumber, productId, lotId, initialMeters: meters }), now],
    });

    return Response.json({ ok: true, rollId: newRollId }, { status: 201 });
  } catch (err) {
    console.error('POST /api/inventory/entry error:', err);
    if (String(err).includes('UNIQUE')) {
      return Response.json({ error: 'El barcode ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error al registrar entrada' }, { status: 500 });
  }
}
