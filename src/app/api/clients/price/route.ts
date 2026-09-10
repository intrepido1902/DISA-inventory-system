import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { normalizeRef } from '@/lib/productFamily';

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
    // productRef may be stored with or without the AS/LSFH family prefix ("AS2203" vs "2203",
    // "LSFH2306" vs "2306") — match either form instead of requiring the data to be normalized.
    const { data } = await (db as any)
      .from('ClientPrice')
      .select('pricePerMeter')
      .eq('clientId', Number(clientId))
      .in('productRef', normalizeRef(ref))
      .limit(1)
      .maybeSingle();

    return Response.json({ pricePerMeter: data?.pricePerMeter ?? null });
  } catch (err) {
    console.error('GET /api/clients/price error:', err);
    return Response.json({ error: 'Error al obtener precio' }, { status: 500 });
  }
}
