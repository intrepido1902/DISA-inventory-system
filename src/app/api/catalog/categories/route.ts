import { getSession } from '@/lib/session';
import db from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const result = await db.execute('SELECT id, name FROM Category ORDER BY name');
    return Response.json(result.rows);
  } catch (err) {
    console.error('GET /api/catalog/categories error:', err);
    return Response.json({ error: 'Error al obtener categorías' }, { status: 500 });
  }
}
