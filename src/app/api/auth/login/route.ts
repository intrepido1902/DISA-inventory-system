import { NextRequest } from 'next/server';
import { validateUser } from '@/lib/auth';
import { createSession, createTempToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
    }

    const user = await validateUser(String(username).toLowerCase().trim(), String(password));

    if (!user) {
      return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    if (user.mustChangePassword) {
      const tempToken = await createTempToken(user.id);
      return Response.json({ mustChangePassword: true, tempToken });
    }

    await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    console.error('Login error:', err);
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
