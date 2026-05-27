import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const isRemnant = searchParams.get('isRemnant') ?? '';

  let sql = `
    SELECT
      r.id, r.rollNumber, r.barcode, r.initialMeters, r.currentMeters,
      r.location, r.status, r.isRemnant, r.createdAt, r.updatedAt,
      p.id as productId, p.name as productName, p.code as productCode,
      p.color, p.width, p.priceOwner, p.priceB2B, p.priceB2C,
      c.id as categoryId, c.name as categoryName,
      l.id as lotId, l.lotNumber
    FROM Roll r
    JOIN Product p ON r.productId = p.id
    JOIN Category c ON p.categoryId = c.id
    LEFT JOIN ImportLot l ON r.lotId = l.id
    WHERE 1=1
  `;
  const args: (string | number)[] = [];

  if (status) {
    sql += ' AND r.status = ?';
    args.push(status);
  }
  if (category) {
    sql += ' AND c.name = ?';
    args.push(category);
  }
  if (isRemnant === 'true') {
    sql += ' AND r.isRemnant = 1';
  }
  if (search) {
    sql += ' AND (r.rollNumber LIKE ? OR r.barcode LIKE ? OR p.name LIKE ? OR p.color LIKE ?)';
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }

  sql += ' ORDER BY r.status ASC, r.updatedAt DESC';

  try {
    const result = await db.execute({ sql, args });
    const rolls = result.rows.map(r => ({
      id: r.id,
      rollNumber: r.rollNumber,
      barcode: r.barcode,
      initialMeters: r.initialMeters,
      currentMeters: r.currentMeters,
      location: r.location,
      status: r.status,
      isRemnant: r.isRemnant === 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      product: {
        id: r.productId,
        name: r.productName,
        code: r.productCode,
        color: r.color,
        width: r.width,
        priceOwner: r.priceOwner,
        priceB2B: r.priceB2B,
        priceB2C: r.priceB2C,
      },
      category: { id: r.categoryId, name: r.categoryName },
      lot: { id: r.lotId, lotNumber: r.lotNumber },
    }));
    return Response.json(rolls);
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    return Response.json({ error: 'Error al obtener inventario' }, { status: 500 });
  }
}
