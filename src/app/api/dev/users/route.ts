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

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'DEVELOPER') {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { data, error } = await db
    .from('User')
    .select('id, email, name, role, active, mustChangePassword, createdAt')
    .order('createdAt', { ascending: true });

  if (error) return Response.json({ error: 'Error al obtener usuarios' }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'DEVELOPER') {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { email, name, role } = await request.json();
  if (!email || !name || !role) {
    return Response.json({ error: 'email, name y role son requeridos' }, { status: 400 });
  }

  const ALLOWED_ROLES = ['OWNER', 'ADMIN', 'WAREHOUSE'];
  if (!ALLOWED_ROLES.includes(role)) {
    return Response.json({ error: 'Rol no válido' }, { status: 400 });
  }

  const tempPassword = randomPassword();
  const hash = await bcrypt.hash(tempPassword, 12);

  const { data, error } = await (db as any)
    .from('User')
    .insert({ email, name, role, password: hash, mustChangePassword: true, active: 1, createdAt: Date.now() })
    .select('id, email, name, role')
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return Response.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 });
    }
    return Response.json({ error: 'Error al crear usuario' }, { status: 500 });
  }

  // Return tempPassword in plaintext ONCE — never stored in DB as plaintext
  return Response.json({ ...data, tempPassword }, { status: 201 });
}
