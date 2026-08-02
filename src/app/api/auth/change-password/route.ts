import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { verifyTempToken, createSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return Response.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return Response.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
    }

    const verified = await verifyTempToken(String(token));
    if (!verified) {
      return Response.json(
        { error: 'El enlace expiró o es inválido. Inicia sesión de nuevo.' },
        { status: 401 },
      );
    }

    const dbAny = db as any;
    const userRes = await dbAny
      .from('User')
      .select('id, email, name, role, password')
      .eq('id', verified.userId)
      .eq('active', 1)
      .single();

    if (userRes.error || !userRes.data) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const user = userRes.data;

    const isSame = await bcrypt.compare(newPassword, user.password as string);
    if (isSame) {
      return Response.json(
        { error: 'La nueva contraseña no puede ser igual a la contraseña temporal' },
        { status: 400 },
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await dbAny.from('User').update({
      password: newHash,
      mustChangePassword: false,
      lastPasswordChange: Date.now(),
    }).eq('id', verified.userId);

    await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return Response.json({ ok: true, role: user.role as string });
  } catch (err) {
    console.error('change-password error:', err);
    return Response.json({ error: 'Error al cambiar la contraseña' }, { status: 500 });
  }
}
