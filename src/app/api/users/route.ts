import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT id, email, name, role, active, "createdAt" FROM "User" ORDER BY "createdAt" ASC`
    );
    return Response.json(result.rows);
  } catch (err) {
    console.error('GET /api/users error:', err);
    return Response.json({ error: 'Error al obtener usuarios' }, { status: 500 });
  }
}
