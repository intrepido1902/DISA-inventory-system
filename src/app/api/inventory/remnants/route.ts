import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');

  try {
    let query = db.from('Roll').select(`
      id, rollNumber, barcode, currentMeters, initialMeters, status, isRemnant,
      product:productId(id, name, color)
    `).eq('status', 'ACTIVE').eq('isRemnant', 1);

    if (productId) query = query.eq('productId', Number(productId));

    const { data, error } = await query.order('currentMeters', { ascending: true });
    if (error) throw error;

    return Response.json((data ?? []).map((r: any) => ({
      id: r.id,
      rollNumber: r.rollNumber,
      barcode: r.barcode,
      currentMeters: r.currentMeters,
      initialMeters: r.initialMeters,
      status: r.status,
      isRemnant: Boolean(r.isRemnant),
      productId: r.product?.id,
      productName: r.product?.name,
      color: r.product?.color,
    })));
  } catch (err) {
    console.error('GET /api/inventory/remnants error:', err);
    return Response.json({ error: 'Error al obtener remanentes' }, { status: 500 });
  }
}
