import { getSession } from '@/lib/session';
import { canSeeFinancials, type Role } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const isOwner = canSeeFinancials(session.role as Role);

  try {
    const todayStart = new Date().setHours(0, 0, 0, 0);

    const [totals, byCategory, remnants, lowStock, todayMovements] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM("currentMeters"), 0) as "totalMeters",
          COUNT(*) as "totalRolls",
          COUNT(DISTINCT "productId") as "totalProducts"
        FROM "Roll" WHERE status = 'ACTIVE'
      `),
      pool.query(`
        SELECT c.name, COUNT(r.id) as rolls, COALESCE(SUM(r."currentMeters"), 0) as meters
        FROM "Roll" r
        JOIN "Product" p ON r."productId" = p.id
        JOIN "Category" c ON p."categoryId" = c.id
        WHERE r.status = 'ACTIVE'
        GROUP BY c.id, c.name
      `),
      pool.query(`SELECT COUNT(*) as count FROM "Roll" WHERE "isRemnant" = 1 AND status = 'ACTIVE'`),
      pool.query(`
        SELECT p.name, p.code, COALESCE(SUM(r."currentMeters"), 0) as "totalMeters"
        FROM "Product" p
        LEFT JOIN "Roll" r ON r."productId" = p.id AND r.status = 'ACTIVE'
        WHERE p.active = 1
        GROUP BY p.id, p.name, p.code
        HAVING COALESCE(SUM(r."currentMeters"), 0) < 100
        ORDER BY COALESCE(SUM(r."currentMeters"), 0) ASC
        LIMIT 5
      `),
      pool.query(`
        SELECT m.id, m.type, m.meters, m."createdAt",
               r."rollNumber", p.name as "productName", p.color, p."priceB2B",
               u.name as "userName", cl.name as "clientName"
        FROM "Movement" m
        JOIN "Roll" r ON m."rollId" = r.id
        JOIN "Product" p ON r."productId" = p.id
        JOIN "User" u ON m."userId" = u.id
        LEFT JOIN "Sale" s ON m."saleId" = s.id
        LEFT JOIN "Client" cl ON s."clientId" = cl.id
        WHERE m."createdAt" >= $1
        ORDER BY m."createdAt" DESC
        LIMIT 20
      `, [todayStart]),
    ]);

    const t = totals.rows[0];

    const stats: Record<string, unknown> = {
      totalMeters: t.totalMeters,
      totalRolls: t.totalRolls,
      totalProducts: t.totalProducts,
      byCategory: byCategory.rows,
      remnants: remnants.rows[0].count as number,
      lowStock: lowStock.rows,
      todayMovements: todayMovements.rows,
    };

    if (isOwner) {
      const [valueResult, dayTotalResult] = await Promise.all([
        pool.query(`
          SELECT COALESCE(SUM(r."currentMeters" * p."priceB2B"), 0) as "inventoryValue"
          FROM "Roll" r
          JOIN "Product" p ON r."productId" = p.id
          WHERE r.status = 'ACTIVE'
        `),
        pool.query(`
          SELECT COALESCE(SUM(m.meters * p."priceB2B"), 0) as "dayTotal"
          FROM "Movement" m
          JOIN "Roll" r ON m."rollId" = r.id
          JOIN "Product" p ON r."productId" = p.id
          WHERE m."createdAt" >= $1 AND m.type IN ('EXIT_FULL','EXIT_PARTIAL')
        `, [todayStart]),
      ]);
      stats.inventoryValue = valueResult.rows[0].inventoryValue;
      stats.dayTotal = dayTotalResult.rows[0].dayTotal;
    }

    return Response.json(stats);
  } catch (err) {
    console.error('GET /api/dashboard/stats error:', err);
    return Response.json({ error: 'Error al obtener estadísticas' }, { status: 500 });
  }
}
