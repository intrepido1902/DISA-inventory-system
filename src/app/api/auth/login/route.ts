import { NextRequest } from 'next/server';
import { validateUser } from '@/lib/auth';
import { createSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: 'Correo y contraseña requeridos' }, { status: 400 });
    }

    const user = await validateUser(String(email), String(password));

    if (!user) {
      return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 });
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
