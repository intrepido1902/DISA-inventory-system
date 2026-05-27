import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { rollId, meters, clientId, notes, exitType } = await request.json();

    if (!rollId || !clientId || !exitType) {
      return Response.json({ error: 'rollId, clientId y exitType son requeridos' }, { status: 400 });
    }

    if (exitType !== 'EXIT_FULL' && exitType !== 'EXIT_PARTIAL') {
      return Response.json({ error: 'exitType debe ser EXIT_FULL o EXIT_PARTIAL' }, { status: 400 });
    }

    // Fetch roll
    const rollResult = await db.execute({
      sql: 'SELECT id, currentMeters, status FROM Roll WHERE id = ?',
      args: [rollId],
    });

    if (rollResult.rows.length === 0) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const roll = rollResult.rows[0];

    if (roll.status !== 'ACTIVE') {
      return Response.json({ error: 'El rollo no está activo' }, { status: 400 });
    }

    const currentMeters = roll.currentMeters as number;

    let metersUsed: number;

    if (exitType === 'EXIT_FULL') {
      metersUsed = currentMeters;
    } else {
      // EXIT_PARTIAL
      const metersNum = Number(meters);
      if (isNaN(metersNum) || metersNum <= 0) {
        return Response.json({ error: 'Los metros deben ser un número positivo' }, { status: 400 });
      }
      if (metersNum > currentMeters) {
        return Response.json({
          error: `Metros insuficientes. Disponibles: ${currentMeters}m`,
        }, { status: 400 });
      }
      metersUsed = metersNum;
    }

    const newMeters = currentMeters - metersUsed;
    // Remnant threshold: ≤10m remaining
    const isRemnant = newMeters > 0 && newMeters <= 10 ? 1 : 0;
    const newStatus = newMeters === 0 ? 'DEPLETED' : 'ACTIVE';
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Update roll
    await db.execute({
      sql: `UPDATE Roll SET currentMeters = ?, status = ?, isRemnant = ?, updatedAt = ? WHERE id = ?`,
      args: [newMeters, newStatus, isRemnant, now, rollId],
    });

    // Create sale
    const saleResult = await db.execute({
      sql: `INSERT INTO Sale (clientId, date, total, createdAt) VALUES (?, ?, null, ?)`,
      args: [clientId, today, now],
    });
    const saleId = saleResult.lastInsertRowid;

    // Create movement
    const movResult = await db.execute({
      sql: `INSERT INTO Movement (type, rollId, meters, userId, saleId, notes, barcodeUsed, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      args: [exitType, rollId, metersUsed, session.userId, saleId, notes ?? null, now],
    });

    // Create audit log
    await db.execute({
      sql: `INSERT INTO AuditLog (userId, action, entity, entityId, oldData, newData, createdAt)
            VALUES (?, ?, 'Roll', ?, ?, ?, ?)`,
      args: [
        session.userId,
        exitType,
        rollId,
        JSON.stringify({ currentMeters }),
        JSON.stringify({ currentMeters: newMeters, status: newStatus }),
        now,
      ],
    });

    return Response.json({
      ok: true,
      movementId: Number(movResult.lastInsertRowid),
      newMeters,
      newStatus,
      isRemnant: isRemnant === 1,
    });
  } catch (err) {
    console.error('POST /api/inventory/exit error:', err);
    return Response.json({ error: 'Error al registrar salida' }, { status: 500 });
  }
}
