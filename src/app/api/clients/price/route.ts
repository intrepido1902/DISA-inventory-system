import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const clientId = sp.get('clientId');
  const ref = sp.get('ref');

  if (!clientId || !ref) {
    return Response.json({ error: 'clientId y ref son requeridos' }, { status: 400 });
  }

  try {
    const { data } = await (db as any)
      .from('ClientPrice')
      .select('pricePerMeter')
      .eq('clientId', Number(clientId))
      .eq('productRef', ref)
      .maybeSingle();

    return Response.json({ pricePerMeter: data?.pricePerMeter ?? null });
  } catch (err) {
    console.error('GET /api/clients/price error:', err);
    return Response.json({ error: 'Error al obtener precio' }, { status: 500 });
  }
}
