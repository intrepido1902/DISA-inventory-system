import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? '';
  const date = searchParams.get('date') ?? '';

  const params: (string | number)[] = [];
  function p(val: string | number) {
    params.push(val);
    return `$${params.length}`;
  }

  let sql = `
    SELECT
      m.id, m.type, m.meters, m.notes, m."barcodeUsed", m."createdAt",
      r."rollNumber", r.barcode,
      p.name as "productName", p.code as "productCode", p.color, p."priceB2B",
      u.name as "userName",
      cl.name as "clientName", cl.type as "clientType"
    FROM "Movement" m
    JOIN "Roll" r ON m."rollId" = r.id
    JOIN "Product" p ON r."productId" = p.id
    JOIN "User" u ON m."userId" = u.id
    LEFT JOIN "Sale" s ON m."saleId" = s.id
    LEFT JOIN "Client" cl ON s."clientId" = cl.id
    WHERE 1=1
  `;

  if (type) sql += ` AND m.type = ${p(type)}`;
  if (date) {
    const dayStart = new Date(date).setHours(0, 0, 0, 0);
    const dayEnd = new Date(date).setHours(23, 59, 59, 999);
    sql += ` AND m."createdAt" BETWEEN ${p(dayStart)} AND ${p(dayEnd)}`;
  }

  sql += ` ORDER BY m."createdAt" DESC LIMIT 100`;

  try {
    const result = await pool.query(sql, params);
    return Response.json(result.rows);
  } catch (err) {
    console.error('GET /api/movements error:', err);
    return Response.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}
