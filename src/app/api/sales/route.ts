import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canSeeCatalog(session.role as Role)) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const clientIdParam = sp.get('clientId') ?? '';
  const dateFrom = sp.get('dateFrom') ?? '';
  const dateTo   = sp.get('dateTo')   ?? '';
  const page  = Math.max(1, parseInt(sp.get('page')  ?? '1'));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50')));
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  try {
    const dbAny = db as any;

    // Shared filters applied both to the paginated Sale fetch and to the "all matching ids"
    // query used below to compute the true (non-voided) count.
    function applySaleFilters(q: any) {
      if (clientIdParam) q = q.eq('clientId', Number(clientIdParam));
      if (dateFrom) q = q.gte('createdAt', new Date(dateFrom).setHours(0, 0, 0, 0));
      if (dateTo)   q = q.lte('createdAt', new Date(dateTo).setHours(23, 59, 59, 999));
      return q;
    }

    const { data: sales, error } = await applySaleFilters(
      dbAny.from('Sale').select('id, clientId, clientName, date, subtotal, discount, total, createdAt')
    )
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (error) throw error;

    // Supabase's count: 'exact' on Sale counts fully-voided sales too (every movement
    // reverted). The true total is the number of sales — across ALL pages matching the
    // filters, not just this one — that still have at least one non-reverted exit movement.
    const { data: allSaleIdRows, error: idsError } = await applySaleFilters(
      dbAny.from('Sale').select('id').limit(10000)
    );
    if (idsError) throw idsError;

    const allSaleIds = (allSaleIdRows ?? []).map((r: any) => r.id as number);

    const activeSaleIds = new Set<number>();
    const CHUNK = 500;
    for (let i = 0; i < allSaleIds.length; i += CHUNK) {
      const chunk = allSaleIds.slice(i, i + CHUNK);
      const { data: activeRows, error: activeErr } = await dbAny
        .from('Movement')
        .select('saleId')
        .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
        .neq('reverted', true)
        .in('saleId', chunk);
      if (activeErr) throw activeErr;
      for (const r of activeRows ?? []) activeSaleIds.add(r.saleId as number);
    }

    const total = activeSaleIds.size;

    if (!sales || sales.length === 0) {
      return Response.json({ data: [], total, totalPages: Math.ceil(total / limit) });
    }

    // Fetch exit movements for these sales to compute rollCount + totalMeters
    const saleIds = (sales as any[]).map(s => s.id as number);
    const { data: movements } = await dbAny
      .from('Movement')
      .select('saleId, rollId, meters')
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .in('saleId', saleIds)
      .neq('reverted', true);

    // Aggregate per saleId
    const movMap = new Map<number, { rollCount: number; totalMeters: number }>();
    for (const m of movements ?? []) {
      const agg = movMap.get(m.saleId as number);
      if (agg) {
        agg.rollCount++;
        agg.totalMeters += Number(m.meters ?? 0);
      } else {
        movMap.set(m.saleId as number, { rollCount: 1, totalMeters: Number(m.meters ?? 0) });
      }
    }

    const data = (sales as any[])
      .filter(s => movMap.has(s.id as number))
      .map(s => ({
      id:          s.id          as number,
      clientId:    s.clientId    as number,
      clientName:  s.clientName  as string,
      date:        s.date        as string,
      subtotal:    s.subtotal    as number,
      discount:    s.discount    as number,
      total:       s.total       as number,
      createdAt:   s.createdAt   as number,
      rollCount:   movMap.get(s.id as number)?.rollCount   ?? 0,
      totalMeters: movMap.get(s.id as number)?.totalMeters ?? 0,
    }));

    return Response.json({ data, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET /api/sales error:', err);
    return Response.json({ error: 'Error al obtener ventas' }, { status: 500 });
  }
}
