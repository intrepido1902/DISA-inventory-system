import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') ?? '').toLowerCase();
  const statusFilter = searchParams.get('status') ?? '';
  const categoryFilter = searchParams.get('category') ?? '';
  const isRemnantFilter = searchParams.get('isRemnant') ?? '';

  try {
    let query = db.from('Roll').select(`
      id, rollNumber, barcode, initialMeters, currentMeters,
      location, status, isRemnant, createdAt, updatedAt,
      product:productId(id, name, code, color, width, priceOwner, priceB2B, priceB2C,
        category:categoryId(id, name)
      ),
      lot:lotId(id, lotNumber)
    `);

    if (statusFilter) query = query.eq('status', statusFilter);
    if (isRemnantFilter === 'true') query = query.eq('isRemnant', 1);

    const { data, error } = await query
      .order('status', { ascending: true })
      .order('updatedAt', { ascending: false });

    if (error) throw error;

    let rolls = (data ?? []).map((r: any) => ({
      id: r.id,
      rollNumber: r.rollNumber,
      barcode: r.barcode,
      initialMeters: r.initialMeters,
      currentMeters: r.currentMeters,
      location: r.location,
      status: r.status,
      isRemnant: Boolean(r.isRemnant),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      product: {
        id: r.product?.id,
        name: r.product?.name,
        code: r.product?.code,
        color: r.product?.color,
        width: r.product?.width,
        priceOwner: r.product?.priceOwner,
        priceB2B: r.product?.priceB2B,
        priceB2C: r.product?.priceB2C,
      },
      category: { id: r.product?.category?.id, name: r.product?.category?.name },
      lot: { id: r.lot?.id ?? null, lotNumber: r.lot?.lotNumber ?? null },
    }));

    // Client-side filtering for category and search
    if (categoryFilter) {
      rolls = rolls.filter(r => r.category.name === categoryFilter);
    }
    if (search) {
      rolls = rolls.filter(r =>
        r.rollNumber?.toLowerCase().includes(search) ||
        r.barcode?.toLowerCase().includes(search) ||
        r.product?.name?.toLowerCase().includes(search) ||
        r.product?.color?.toLowerCase().includes(search)
      );
    }

    return Response.json(rolls);
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    return Response.json({ error: 'Error al obtener inventario' }, { status: 500 });
  }
}
