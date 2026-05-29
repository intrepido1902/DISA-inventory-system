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
    // NOTE: disaNumber requires SQL migration:
    // ALTER TABLE "Roll" ADD COLUMN "disaNumber" TEXT;
    // CREATE UNIQUE INDEX roll_disanumber_idx ON "Roll"("disaNumber") WHERE "disaNumber" IS NOT NULL;
    let query = db.from('Roll').select(`
      id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
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
      id: r.id as number,
      rollNumber: r.rollNumber as string,
      barcode: r.barcode as string | null,
      disaNumber: r.disaNumber as string | null ?? null,
      initialMeters: r.initialMeters as number,
      currentMeters: r.currentMeters as number,
      location: r.location as string,
      status: r.status as string,
      isRemnant: Boolean(r.isRemnant),
      createdAt: r.createdAt as number,
      updatedAt: r.updatedAt as number,
      product: {
        id: r.product?.id as number,
        name: r.product?.name as string,
        code: r.product?.code as string,
        color: r.product?.color as string,
        width: r.product?.width as number,
        priceOwner: r.product?.priceOwner as number,
        priceB2B: r.product?.priceB2B as number,
        priceB2C: r.product?.priceB2C as number,
      },
      category: { id: r.product?.category?.id as number, name: r.product?.category?.name as string },
      lot: { id: r.lot?.id as number | null ?? null, lotNumber: r.lot?.lotNumber as string | null ?? null },
    }));

    if (categoryFilter) {
      rolls = rolls.filter(r => r.category.name?.toLowerCase() === categoryFilter.toLowerCase());
    }
    if (search) {
      rolls = rolls.filter(r =>
        (r.disaNumber ?? '').toLowerCase().includes(search) ||
        r.rollNumber?.toLowerCase().includes(search) ||
        (r.barcode ?? '').toLowerCase().includes(search) ||
        r.product?.name?.toLowerCase().includes(search) ||
        r.product?.code?.toLowerCase().includes(search) ||
        r.product?.color?.toLowerCase().includes(search) ||
        r.location?.toLowerCase().includes(search)
      );
    }

    return Response.json(rolls);
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    return Response.json({ error: 'Error al obtener inventario' }, { status: 500 });
  }
}
