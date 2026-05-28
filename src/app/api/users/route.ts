import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') return Response.json({ error: 'Sin permisos' }, { status: 403 });

  try {
    const { data, error } = await db.from('User').select('id, email, name, role, active, createdAt').order('createdAt', { ascending: true });
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (err) {
    console.error('GET /api/users error:', err);
    return Response.json({ error: 'Error al obtener usuarios' }, { status: 500 });
  }
}
