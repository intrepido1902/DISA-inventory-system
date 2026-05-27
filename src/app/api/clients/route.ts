import { getSession } from '@/lib/session';
import db from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const result = await db.execute(
      'SELECT id, name, type, phone, email, notes, active, createdAt FROM Client WHERE active = 1 ORDER BY name'
    );
    return Response.json(result.rows);
  } catch (err) {
    console.error('GET /api/clients error:', err);
    return Response.json({ error: 'Error al obtener clientes' }, { status: 500 });
  }
}
