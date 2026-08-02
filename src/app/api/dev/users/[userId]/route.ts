import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

function randomPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== 'DEVELOPER') {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { userId } = await params;
  const id = parseInt(userId, 10);
  if (isNaN(id)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  const body = await request.json();
  const { action } = body as { action: string };

  const dbAny = db as any;

  if (action === 'toggle-active') {
    const { data: user, error: fetchErr } = await dbAny.from('User').select('active').eq('id', id).single();
    if (fetchErr || !user) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    await dbAny.from('User').update({ active: user.active ? 0 : 1 }).eq('id', id);
    return Response.json({ ok: true });
  }

  if (action === 'reset-password') {
    const tempPassword = randomPassword();
    const hash = await bcrypt.hash(tempPassword, 12);
    await dbAny.from('User').update({ password: hash, mustChangePassword: true }).eq('id', id);
    return Response.json({ ok: true, tempPassword });
  }

  if (action === 'change-role') {
    const { role } = body as { action: string; role: string };
    const ALLOWED_ROLES = ['OWNER', 'ADMIN', 'WAREHOUSE'];
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return Response.json({ error: 'Rol no válido' }, { status: 400 });
    }
    await dbAny.from('User').update({ role }).eq('id', id);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
}
