import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

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

    // Fetch roll + priceB2B for total calculation
    const rollResult = await pool.query(
      `SELECT r.id, r."currentMeters", r.status, p."priceB2B"
       FROM "Roll" r
       JOIN "Product" p ON r."productId" = p.id
       WHERE r.id = $1`,
      [rollId]
    );

    if (rollResult.rows.length === 0) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const roll = rollResult.rows[0];

    if (roll.status !== 'ACTIVE') {
      return Response.json({ error: 'El rollo no está activo' }, { status: 400 });
    }

    const currentMeters = roll.currentMeters as number;
    const priceB2B = roll.priceB2B as number;

    let metersUsed: number;

    if (exitType === 'EXIT_FULL') {
      metersUsed = currentMeters;
    } else {
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
    const isRemnant = newMeters > 0 && newMeters <= 10 ? 1 : 0;
    const newStatus = newMeters === 0 ? 'DEPLETED' : 'ACTIVE';
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const total = metersUsed * priceB2B;

    await pool.query(
      `UPDATE "Roll" SET "currentMeters" = $1, status = $2, "isRemnant" = $3, "updatedAt" = $4 WHERE id = $5`,
      [newMeters, newStatus, isRemnant, now, rollId]
    );

    const saleResult = await pool.query(
      `INSERT INTO "Sale" ("clientId", date, total, "createdAt") VALUES ($1, $2, $3, $4) RETURNING id`,
      [clientId, today, total, now]
    );
    const saleId = saleResult.rows[0].id;

    const movResult = await pool.query(
      `INSERT INTO "Movement" (type, "rollId", meters, "userId", "saleId", notes, "barcodeUsed", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7) RETURNING id`,
      [exitType, rollId, metersUsed, session.userId, saleId, notes ?? null, now]
    );

    await pool.query(
      `INSERT INTO "AuditLog" ("userId", action, entity, "entityId", "oldData", "newData", "createdAt")
       VALUES ($1, $2, 'Roll', $3, $4, $5, $6)`,
      [
        session.userId,
        exitType,
        rollId,
        JSON.stringify({ currentMeters }),
        JSON.stringify({ currentMeters: newMeters, status: newStatus }),
        now,
      ]
    );

    return Response.json({
      ok: true,
      movementId: movResult.rows[0].id,
      newMeters,
      newStatus,
      isRemnant: isRemnant === 1,
    });
  } catch (err) {
    console.error('POST /api/inventory/exit error:', err);
    return Response.json({ error: 'Error al registrar salida' }, { status: 500 });
  }
}
