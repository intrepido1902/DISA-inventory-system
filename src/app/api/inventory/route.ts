import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const isRemnant = searchParams.get('isRemnant') ?? '';

  const params: (string | number)[] = [];
  function p(val: string | number) {
    params.push(val);
    return `$${params.length}`;
  }

  let sql = `
    SELECT
      r.id, r."rollNumber", r.barcode, r."initialMeters", r."currentMeters",
      r.location, r.status, r."isRemnant", r."createdAt", r."updatedAt",
      p.id as "productId", p.name as "productName", p.code as "productCode",
      p.color, p.width, p."priceOwner", p."priceB2B", p."priceB2C",
      c.id as "categoryId", c.name as "categoryName",
      l.id as "lotId", l."lotNumber"
    FROM "Roll" r
    JOIN "Product" p ON r."productId" = p.id
    JOIN "Category" c ON p."categoryId" = c.id
    LEFT JOIN "ImportLot" l ON r."lotId" = l.id
    WHERE 1=1
  `;

  if (status) sql += ` AND r.status = ${p(status)}`;
  if (category) sql += ` AND c.name = ${p(category)}`;
  if (isRemnant === 'true') sql += ` AND r."isRemnant" = 1`;
  if (search) {
    const like = `%${search}%`;
    sql += ` AND (r."rollNumber" LIKE ${p(like)} OR r.barcode LIKE ${p(like)} OR p.name LIKE ${p(like)} OR p.color LIKE ${p(like)})`;
  }

  sql += ` ORDER BY r.status ASC, r."updatedAt" DESC`;

  try {
    const result = await pool.query(sql, params);
    const rolls = result.rows.map(row => ({
      id: row.id,
      rollNumber: row.rollNumber,
      barcode: row.barcode,
      initialMeters: row.initialMeters,
      currentMeters: row.currentMeters,
      location: row.location,
      status: row.status,
      isRemnant: row.isRemnant === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      product: {
        id: row.productId,
        name: row.productName,
        code: row.productCode,
        color: row.color,
        width: row.width,
        priceOwner: row.priceOwner,
        priceB2B: row.priceB2B,
        priceB2C: row.priceB2C,
      },
      category: { id: row.categoryId, name: row.categoryName },
      lot: { id: row.lotId, lotNumber: row.lotNumber },
    }));
    return Response.json(rolls);
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    return Response.json({ error: 'Error al obtener inventario' }, { status: 500 });
  }
}
