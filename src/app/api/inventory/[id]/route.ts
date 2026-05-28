import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;

  try {
    const rollResult = await pool.query(`
      SELECT
        r.id, r."rollNumber", r.barcode, r."initialMeters", r."currentMeters",
        r.location, r.status, r."isRemnant", r."createdAt", r."updatedAt",
        p.id as "productId", p.name as "productName", p.code as "productCode",
        p.color, p.width, p."priceOwner", p."priceB2B", p."priceB2C",
        c.name as "categoryName", l."lotNumber"
      FROM "Roll" r
      JOIN "Product" p ON r."productId" = p.id
      JOIN "Category" c ON p."categoryId" = c.id
      LEFT JOIN "ImportLot" l ON r."lotId" = l.id
      WHERE r.id = $1
    `, [id]);

    if (rollResult.rows.length === 0) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const r = rollResult.rows[0];

    const movResult = await pool.query(`
      SELECT m.id, m.type, m.meters, m.notes, m."barcodeUsed", m."createdAt",
             u.name as "userName",
             cl.name as "clientName"
      FROM "Movement" m
      JOIN "User" u ON m."userId" = u.id
      LEFT JOIN "Sale" s ON m."saleId" = s.id
      LEFT JOIN "Client" cl ON s."clientId" = cl.id
      WHERE m."rollId" = $1
      ORDER BY m."createdAt" DESC
      LIMIT 50
    `, [id]);

    return Response.json({
      id: r.id,
      rollNumber: r.rollNumber,
      barcode: r.barcode,
      initialMeters: r.initialMeters,
      currentMeters: r.currentMeters,
      location: r.location,
      status: r.status,
      isRemnant: r.isRemnant === 1,
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
      categoryName: r.categoryName,
      lotNumber: r.lotNumber,
      movements: movResult.rows,
    });
  } catch (err) {
    console.error('GET /api/inventory/[id] error:', err);
    return Response.json({ error: 'Error al obtener rollo' }, { status: 500 });
  }
}
