import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { data, error } = await db.from('Client').select('id, name, type, phone, email, notes, active, createdAt').eq('active', 1).order('name', { ascending: true });
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (err) {
    console.error('GET /api/clients error:', err);
    return Response.json({ error: 'Error al obtener clientes' }, { status: 500 });
  }
}
