import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { getFamilyOrFilter, buildCodeFilter, type ProductFamily } from '@/lib/productFamily';

const ROLL_SELECT = `
  id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
  location, status, isRemnant, createdAt, updatedAt,
  hasDefect, defectNote, defectDiscountPct,
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
    hasDefect: Boolean(r.hasDefect),
    defectNote: (r.defectNote ?? null) as string | null,
    defectDiscountPct: (r.defectDiscountPct ?? null) as number | null,
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
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1'));
  const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100')));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  // ── Filter params ────────────────────────────────────────────────────────────
  // Product-level filters
  const search       = (sp.get('search')   ?? '').trim();   // reference text (Product.code, family-aware)
  const familyParam  = (sp.get('family')   ?? '').trim();   // 'LSFH' | 'AS'
  const categoryFilter = (sp.get('category') ?? '').trim(); // backward compat (1=Velo, 2=Blackout)
  const colorFilter  = (sp.get('color')    ?? '').trim();   // exact Product.color match
  const widthFilter  = (sp.get('width')    ?? '').trim();   // exact Product.width match (number)

  // Roll-level filters
  const statusParam      = (sp.get('status')     ?? '').trim();          // ACTIVE|REMNANT|WRITTEN_OFF
  const isRemnantParam   = (sp.get('isRemnant')  ?? '');                 // 'true' for remnants tab
  const productIdParam   = (sp.get('productId')  ?? '');                 // direct productId (exit modal)
  const rollNumberSearch = (sp.get('rollNumber') ?? '').trim();          // consecutivo — exact match on Roll.rollNumber
  const minMeters        = (sp.get('minMeters')  ?? '').trim();
  const maxMeters        = (sp.get('maxMeters')  ?? '').trim();
  const showDepleted     = sp.get('showDepleted') === 'true';            // TAREA 4: default hidden

  const EMPTY = Response.json({ data: [], total: 0, totalMeters: 0, page, limit, totalPages: 0 });

  try {
    // ── Step 1: resolve product IDs from Product-level filters ───────────────
    let productIdFilter: number[] | null = null;

    // Helper: intersect/set a new list of product IDs
    function intersectProductIds(newIds: number[]): boolean {
      if (newIds.length === 0) return false; // empty → no matches
      productIdFilter = productIdFilter !== null
        ? productIdFilter.filter(id => newIds.includes(id))
        : newIds;
      return productIdFilter.length > 0;
    }

    // Family filter (TAREA 1+2)
    if (familyParam === 'LSFH' || familyParam === 'AS') {
      const orExpr = getFamilyOrFilter(familyParam as ProductFamily);
      const { data: pRows, error: pErr } = await (db as any).from('Product').select('id').or(orExpr);
      if (pErr) { console.error('[inventory] family filter error:', pErr); throw pErr; }
      if (!intersectProductIds((pRows ?? []).map((p: any) => p.id as number))) return EMPTY;
    }

    // Backward-compat category filter
    if (categoryFilter) {
      const catId = parseInt(categoryFilter);
      if (isNaN(catId)) return EMPTY;
      const { data: pRows, error: pErr } = await (db as any).from('Product').select('id').eq('categoryId', catId);
      if (pErr) { console.error('[inventory] category filter error:', pErr); throw pErr; }
      if (!intersectProductIds((pRows ?? []).map((p: any) => p.id as number))) return EMPTY;
    }

    // Color filter
    if (colorFilter) {
      const { data: pRows, error: pErr } = await (db as any).from('Product').select('id').eq('color', colorFilter);
      if (pErr) { console.error('[inventory] color filter error:', pErr); throw pErr; }
      if (!intersectProductIds((pRows ?? []).map((p: any) => p.id as number))) return EMPTY;
    }

    // Width filter
    if (widthFilter) {
      const widthNum = parseInt(widthFilter);
      if (!isNaN(widthNum)) {
        const { data: pRows, error: pErr } = await (db as any).from('Product').select('id').eq('width', widthNum);
        if (pErr) { console.error('[inventory] width filter error:', pErr); throw pErr; }
        if (!intersectProductIds((pRows ?? []).map((p: any) => p.id as number))) return EMPTY;
      }
    }

    // Reference text search — Product.code only, expanded via buildCodeFilter to recognize
    // family shorthand (e.g. "lsfh"/"23" or "as"/"22"). Consecutivo has its own dedicated
    // field/param below — the two never mix.
    if (search) {
      const { data: pRows, error: pErr } = await (db as any).from('Product').select('id').or(buildCodeFilter(search));
      if (pErr) { console.error('[inventory] search (product.code) error:', pErr); throw pErr; }
      const searchIds = (pRows ?? []).map((p: any) => p.id as number);
      if (!intersectProductIds(searchIds)) return EMPTY;
    }

    // ── Step 2: build Roll filter helper ──────────────────────────────────────
    function applyRollFilters(q: any): any {
      // Remnant tab takes priority over status dropdown
      if (isRemnantParam === 'true') {
        q = q.eq('status', 'REMNANT');
      } else if (statusParam) {
        q = q.eq('status', statusParam);
      } else if (!showDepleted) {
        // TAREA 4: hide DEPLETED by default
        q = q.neq('status', 'DEPLETED');
      }

      // Direct productId filter (exit modal quick-select)
      if (productIdParam && !isNaN(parseInt(productIdParam))) {
        q = q.eq('productId', parseInt(productIdParam));
      }

      // Combined product-level filter (family + category + color + width + search)
      if (productIdFilter !== null) {
        q = q.in('productId', productIdFilter);
      }

      // Meters range
      if (minMeters) q = q.gte('currentMeters', parseFloat(minMeters));
      if (maxMeters) q = q.lte('currentMeters', parseFloat(maxMeters));

      // Consecutivo search — exact match on Roll.rollNumber (unique per roll, never partial).
      // Independent from the reference (Product.code) filter above — the two are never combined.
      if (rollNumberSearch) {
        q = q.eq('rollNumber', rollNumberSearch);
      }

      return q;
    }

    // ── Step 3: paginated data query ──────────────────────────────────────────
    let dataQuery: any = (db as any).from('Roll').select(ROLL_SELECT, { count: 'exact' });
    dataQuery = applyRollFilters(dataQuery);

    // TAREA 2: sort by currentMeters ASC when searching by reference; else by id ASC
    if (search || rollNumberSearch) {
      dataQuery = dataQuery.order('currentMeters', { ascending: true });
    } else {
      dataQuery = dataQuery.order('id', { ascending: true });
    }

    const { data, count, error } = await dataQuery.range(from, to);
    if (error) throw error;

    const total = count ?? 0;

    // ── Step 4: global totalMeters for the entire filtered set (TAREA 3) ──────
    let totalMeters = 0;
    if (total > 0) {
      let metersQuery: any = (db as any).from('Roll').select('currentMeters');
      metersQuery = applyRollFilters(metersQuery);
      const { data: mRows, error: mErr } = await metersQuery;
      if (!mErr && mRows) {
        totalMeters = (mRows as any[]).reduce((sum: number, r: any) => sum + (Number(r.currentMeters) || 0), 0);
      }
    }

    return Response.json({
      data: (data ?? []).map(mapRoll),
      total,
      totalMeters,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('GET /api/inventory error:', err);
    return Response.json({ error: 'Error al obtener inventario' }, { status: 500 });
  }
}
