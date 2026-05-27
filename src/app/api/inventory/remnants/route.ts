import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');

  try {
    let sql = `
      SELECT r.id, r.rollNumber, r.barcode, r.currentMeters, r.initialMeters, r.status, r.isRemnant,
             p.id AS productId, p.name AS productName, p.color
      FROM Roll r
      JOIN Product p ON r.productId = p.id
      WHERE r.status = 'ACTIVE' AND r.isRemnant = 1
    `;
    const args: (string | number)[] = [];

    if (productId) {
      sql += ' AND p.id = ?';
      args.push(Number(productId));
    }

    sql += ' ORDER BY r.currentMeters ASC';

    const result = await db.execute({ sql, args });
    return Response.json(result.rows);
  } catch (err) {
    console.error('GET /api/inventory/remnants error:', err);
    return Response.json({ error: 'Error al obtener remanentes' }, { status: 500 });
  }
}
