import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;

  try {
    const { data, error } = await (db as any)
      .from('ClientPrice')
      .select('id, productRef, pricePerMeter')
      .eq('clientId', Number(id))
      .order('productRef', { ascending: true });

    if (error) throw error;
    return Response.json(data ?? []);
  } catch (err) {
    console.error('GET /api/clients/[id]/prices error:', err);
    return Response.json({ error: 'Error al obtener precios' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') {
    return Response.json({ error: 'Solo el propietario puede editar precios' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { productRef, pricePerMeter } = body as { productRef?: string; pricePerMeter?: number };

  if (!productRef || pricePerMeter === undefined || pricePerMeter === null) {
    return Response.json({ error: 'productRef y pricePerMeter son requeridos' }, { status: 400 });
  }

  try {
    const { data, error } = await (db as any)
      .from('ClientPrice')
      .upsert(
        { clientId: Number(id), productRef, pricePerMeter: Number(pricePerMeter), createdAt: Date.now() },
        { onConflict: 'clientId,productRef' },
      )
      .select()
      .single();

    if (error) throw error;
    return Response.json(data);
  } catch (err) {
    console.error('PUT /api/clients/[id]/prices error:', err);
    return Response.json({ error: 'Error al actualizar precio' }, { status: 500 });
  }
}
