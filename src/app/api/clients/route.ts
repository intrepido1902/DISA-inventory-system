import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canManageClients, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { data, error } = await db
      .from('Client')
      .select('id, name, type, phone, email, notes, active, createdAt, pricePerMeter')
      .eq('active', 1)
      .order('name', { ascending: true });
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (err) {
    console.error('GET /api/clients error:', err);
    return Response.json({ error: 'Error al obtener clientes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canManageClients(session.role as Role)) {
    return Response.json({ error: 'Sin permisos — solo OWNER y ADMIN pueden crear clientes' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, type, phone, email, notes, pricePerMeter } = body as {
      name?: string;
      type?: string;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
      pricePerMeter?: number | null;
    };

    if (!name?.trim()) {
      return Response.json({ error: 'El nombre del cliente es requerido' }, { status: 400 });
    }

    // DISTRIBUTOR = Fijo (has fixed pricePerMeter), DECORATOR = Ocasional
    const validTypes = ['DISTRIBUTOR', 'DECORATOR'];
    const clientType = validTypes.includes(type ?? '') ? type! : 'DISTRIBUTOR';

    // pricePerMeter required for DISTRIBUTOR clients
    const priceValue = clientType === 'DISTRIBUTOR' && pricePerMeter && pricePerMeter > 0
      ? pricePerMeter
      : null;

    const now = Date.now();
    const dbAny = db as any;

    const { data, error } = await dbAny
      .from('Client')
      .insert({
        name: name.trim(),
        type: clientType,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        notes: notes?.trim() || null,
        pricePerMeter: priceValue,
        active: 1,
        createdAt: now,
      })
      .select('id, name, type, phone, email, notes, active, createdAt, pricePerMeter')
      .single();

    if (error) {
      console.error('POST /api/clients insert error:', error);
      return Response.json({ error: 'Error al crear cliente' }, { status: 500 });
    }

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: 'CREATE_CLIENT',
      entity: 'Client',
      entityId: data.id,
      oldData: null,
      newData: JSON.stringify({ name: name.trim(), type: clientType, pricePerMeter: priceValue }),
      createdAt: now,
    });

    return Response.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/clients error:', err);
    return Response.json({ error: 'Error al crear cliente' }, { status: 500 });
  }
}
