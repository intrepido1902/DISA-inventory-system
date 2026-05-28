import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const rollId = Number(id);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollRes: any = await db.from('Roll').select(`
      id, rollNumber, barcode, initialMeters, currentMeters, location, status, isRemnant, createdAt, updatedAt,
      product:productId(id, name, code, color, width, priceOwner, priceB2B, priceB2C,
        category:categoryId(name)
      ),
      lot:lotId(lotNumber)
    `).eq('id', rollId).single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movRes: any = await db.from('Movement').select(`
      id, type, meters, notes, barcodeUsed, createdAt,
      user:userId(name),
      sale:saleId(client:clientId(name))
    `).eq('rollId', rollId).order('createdAt', { ascending: false }).limit(50);

    if (rollRes.error || !rollRes.data) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const r = rollRes.data;
    const movements = (movRes.data ?? []).map((m: any) => ({
      id: m.id, type: m.type, meters: m.meters, notes: m.notes,
      barcodeUsed: Boolean(m.barcodeUsed), createdAt: m.createdAt,
      userName: m.user?.name ?? '', clientName: m.sale?.client?.name ?? null,
    }));

    return Response.json({
      id: r.id, rollNumber: r.rollNumber, barcode: r.barcode,
      initialMeters: r.initialMeters, currentMeters: r.currentMeters,
      location: r.location, status: r.status, isRemnant: Boolean(r.isRemnant),
      product: {
        id: r.product?.id, name: r.product?.name, code: r.product?.code,
        color: r.product?.color, width: r.product?.width,
        priceOwner: r.product?.priceOwner, priceB2B: r.product?.priceB2B, priceB2C: r.product?.priceB2C,
      },
      categoryName: r.product?.category?.name ?? '',
      lotNumber: r.lot?.lotNumber ?? null,
      movements,
    });
  } catch (err) {
    console.error('GET /api/inventory/[id] error:', err);
    return Response.json({ error: 'Error al obtener rollo' }, { status: 500 });
  }
}
