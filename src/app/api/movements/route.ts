import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get('type') ?? '';
  const dateFilter = searchParams.get('date') ?? '';

  try {
    let query = db.from('Movement').select(`
      id, type, meters, notes, barcodeUsed, createdAt,
      roll:rollId(rollNumber, barcode, product:productId(name, code, color, priceB2B)),
      user:userId(name),
      sale:saleId(client:clientId(name, type))
    `);

    if (typeFilter) query = query.eq('type', typeFilter);
    if (dateFilter) {
      query = query
        .gte('createdAt', new Date(dateFilter).setHours(0, 0, 0, 0))
        .lte('createdAt', new Date(dateFilter).setHours(23, 59, 59, 999));
    }

    const { data, error } = await query
      .order('createdAt', { ascending: false })
      .limit(100);

    if (error) throw error;

    return Response.json((data ?? []).map((m: any) => ({
      id: m.id,
      type: m.type,
      meters: m.meters,
      notes: m.notes,
      barcodeUsed: Boolean(m.barcodeUsed),
      createdAt: m.createdAt,
      rollNumber: m.roll?.rollNumber ?? '',
      barcode: m.roll?.barcode ?? null,
      productName: m.roll?.product?.name ?? '',
      productCode: m.roll?.product?.code ?? '',
      color: m.roll?.product?.color ?? '',
      priceB2B: m.roll?.product?.priceB2B ?? 0,
      userName: m.user?.name ?? '',
      clientName: m.sale?.client?.name ?? null,
      clientType: m.sale?.client?.type ?? null,
    })));
  } catch (err) {
    console.error('GET /api/movements error:', err);
    return Response.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}
