import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canSeeCatalog(session.role as Role)) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? '';
  const userId = searchParams.get('userId') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';

  const params: (string | number)[] = [];
  function p(val: string | number) {
    params.push(val);
    return `$${params.length}`;
  }

  let sql = `
    SELECT
      a.id, a.action, a.entity, a."entityId", a."oldData", a."newData", a."createdAt",
      u.name as "userName", u.email as "userEmail"
    FROM "AuditLog" a
    JOIN "User" u ON a."userId" = u.id
    WHERE 1=1
  `;

  if (action) sql += ` AND a.action = ${p(action)}`;
  if (userId) sql += ` AND a."userId" = ${p(Number(userId))}`;
  if (dateFrom) {
    const from = new Date(dateFrom).setHours(0, 0, 0, 0);
    sql += ` AND a."createdAt" >= ${p(from)}`;
  }
  if (dateTo) {
    const to = new Date(dateTo).setHours(23, 59, 59, 999);
    sql += ` AND a."createdAt" <= ${p(to)}`;
  }

  sql += ` ORDER BY a."createdAt" DESC LIMIT 500`;

  try {
    const [logsResult, usersResult] = await Promise.all([
      pool.query(sql, params),
      pool.query(`SELECT id, name FROM "User" ORDER BY name`),
    ]);

    return Response.json({
      logs: logsResult.rows,
      users: usersResult.rows,
    });
  } catch (err) {
    console.error('GET /api/audit error:', err);
    return Response.json({ error: 'Error al obtener auditoría' }, { status: 500 });
  }
}
