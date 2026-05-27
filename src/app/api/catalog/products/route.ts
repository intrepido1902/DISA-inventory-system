import { getSession } from '@/lib/session';
import db from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const result = await db.execute(`
      SELECT
        p.id, p.name, p.code, p.color, p.width, p.priceOwner, p.priceB2B, p.priceB2C, p.active,
        c.id as categoryId, c.name as categoryName,
        COUNT(CASE WHEN r.status = 'ACTIVE' THEN 1 END) as activeRolls,
        COALESCE(SUM(CASE WHEN r.status = 'ACTIVE' THEN r.currentMeters END), 0) as totalMeters
      FROM Product p
      JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Roll r ON r.productId = p.id
      WHERE p.active = 1
      GROUP BY p.id
      ORDER BY c.name, p.name
    `);

    return Response.json(result.rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      color: r.color,
      width: r.width,
      priceOwner: r.priceOwner,
      priceB2B: r.priceB2B,
      priceB2C: r.priceB2C,
      active: r.active,
      category: { id: r.categoryId, name: r.categoryName },
      activeRolls: r.activeRolls,
      totalMeters: r.totalMeters,
    })));
  } catch (err) {
    console.error('GET /api/catalog/products error:', err);
    return Response.json({ error: 'Error al obtener catálogo' }, { status: 500 });
  }
}
