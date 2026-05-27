import { destroySession } from '@/lib/session';

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    return Response.json({ error: 'Error al cerrar sesión' }, { status: 500 });
  }
}
