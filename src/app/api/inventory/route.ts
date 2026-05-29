import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { BLACKOUT_COLOR_MAP } from '@/lib/colorMap';

const REVERSE_BLACKOUT: Record<string, string> = Object.fromEntries(
  Object.entries(BLACKOUT_COLOR_MAP).map(([k, v]) => [v, k])
);

const ROLL_SELECT = `
  id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
  location, status, isRemnant, createdAt, updatedAt,
  product:productId(id, name, code, color, width, priceOwner, priceB2B, priceB2C,
    category:categoryId(id, name)
  ),
  lot:lotId(id, lotNumber)
`;

function mapRoll(r: any) {
  return {
    id: r.id as number,
    rollNumber: r.rollNumber as string,
    barcode: (r.barcode ?? null) as string | null,
    disaNumber: (r.disaNumber ?? null) as string | null,
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
    lot: { id: (r.lot?.id ?? null) as number | null, lotNumber: (r.lot?.lotNumber ?? null) as string | null },
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
  const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100')));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const search = (sp.get('search') ?? '').trim().toLowerCase();
  const statusParam = sp.get('status') ?? '';
  const categoryFilter = (sp.get('category') ?? '').trim();
  const colorFilter = (sp.get('color') ?? '').trim();
  const minMeters = sp.get('minMeters') ?? '';
  const maxMeters = sp.get('maxMeters') ?? '';
  const locationFilter = (sp.get('location') ?? '').trim();
  const isRemnantParam = sp.get('isRemnant') ?? '';
  const productIdParam = sp.get('productId') ?? '';

  try {
    // ── Step 1: resolve product IDs for category + color filters ─────────────
    // We intersect them so a roll must satisfy both category AND color.
    let productIdFilter: number[] | null = null;

    if (categoryFilter) {
      const { data: catRow } = await db
        .from('Category').select('id').eq('name', categoryFilter).maybeSingle();
      if (!catRow) return Response.json({ data: [], total: 0, page, limit, totalPages: 0 });
      const { data: pRows } = await db
        .from('Product').select('id').eq('categoryId', (catRow as any).id);
      const ids = (pRows ?? []).map((p: any) => p.id as number);
      if (ids.length === 0) return Response.json({ data: [], total: 0, page, limit, totalPages: 0 });
      productIdFilter = ids;
    }

    if (colorFilter) {
      const reverseCode = REVERSE_BLACKOUT[colorFilter];
      const colorValues = reverseCode ? [colorFilter, reverseCode] : [colorFilter];
      const { data: pRows } = await db.from('Product').select('id').in('color', colorValues);
      const colorIds = (pRows ?? []).map((p: any) => p.id as number);
      if (colorIds.length === 0) return Response.json({ data: [], total: 0, page, limit, totalPages: 0 });
      productIdFilter = productIdFilter !== null
        ? productIdFilter.filter(id => colorIds.includes(id))
        : colorIds;
      if (productIdFilter.length === 0) return Response.json({ data: [], total: 0, page, limit, totalPages: 0 });
    }

    // ── Step 2: resolve product IDs matching text search ─────────────────────
    let searchProductIds: number[] | null = null;
    if (search) {
      const orParts = [
        `name.ilike.%${search}%`,
        `code.ilike.%${search}%`,
        `color.ilike.%${search}%`,
      ];
      const sNum = parseFloat(search);
      if (!isNaN(sNum)) orParts.push(`width.eq.${sNum}`);
      const { data: pRows } = await db.from('Product').select('id').or(orParts.join(','));
      searchProductIds = (pRows ?? []).map((p: any) => p.id as number);
    }

    // ── Step 3: build main Roll query ─────────────────────────────────────────
    let query = db.from('Roll').select(ROLL_SELECT, { count: 'exact' });

    // Remnants tab / status filter — after Cambio 3, remnants have status='REMNANT'
    if (isRemnantParam === 'true') {
      query = query.eq('status', 'REMNANT');
    } else if (statusParam === 'REMNANT') {
      query = query.eq('status', 'REMNANT');
    } else if (statusParam) {
      query = query.eq('status', statusParam);
    }

    // Direct product ID filter (used by exit modal)
    if (productIdParam && !isNaN(parseInt(productIdParam))) {
      query = query.eq('productId', parseInt(productIdParam));
    }

    // Combined category + color product ID filter
    if (productIdFilter !== null) {
      query = query.in('productId', productIdFilter);
    }

    // Meters range
    if (minMeters) query = query.gte('currentMeters', parseFloat(minMeters));
    if (maxMeters) query = query.lte('currentMeters', parseFloat(maxMeters));

    // Location
    if (locationFilter) query = query.ilike('location', `%${locationFilter}%`);

    // Text search: OR across roll fields + matching product IDs
    // (the AND with productIdFilter above still constrains product results correctly)
    if (search) {
      const orParts = [
        `disaNumber.ilike.%${search}%`,
        `rollNumber.ilike.%${search}%`,
      ];
      const sNum = parseFloat(search);
      if (!isNaN(sNum)) orParts.push(`currentMeters.eq.${sNum}`);
      if (searchProductIds !== null && searchProductIds.length > 0) {
        orParts.push(`productId.in.(${searchProductIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    // Order: remnants tab sorts by meters ASC; default sorts by status + updatedAt
    if (isRemnantParam === 'true') {
      query = query.order('currentMeters', { ascending: true });
    } else {
      query = query
        .order('status', { ascending: true })
        .order('updatedAt', { ascending: false });
    }

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    const total = count ?? 0;
    return Response.json({
      data: (data ?? []).map(mapRoll),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    return Response.json({ error: 'Error al obtener inventario' }, { status: 500 });
  }
}
