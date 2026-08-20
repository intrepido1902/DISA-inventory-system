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

    let query = dbAny
      .from('Sale')
      .select('id, clientId, clientName, date, subtotal, discount, total, createdAt', { count: 'exact' });

    if (clientIdParam) query = query.eq('clientId', Number(clientIdParam));
    if (dateFrom) query = query.gte('createdAt', new Date(dateFrom).setHours(0, 0, 0, 0));
    if (dateTo)   query = query.lte('createdAt', new Date(dateTo).setHours(23, 59, 59, 999));

    const { data: sales, count, error } = await query
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const total = count ?? 0;

    if (!sales || sales.length === 0) {
      return Response.json({ data: [], total, totalPages: Math.ceil(total / limit) });
    }

    // Fetch exit movements for these sales to compute rollCount + totalMeters
    const saleIds = (sales as any[]).map(s => s.id as number);
    const { data: movements } = await dbAny
      .from('Movement')
      .select('saleId, rollId, meters')
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .in('saleId', saleIds);

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

    const data = (sales as any[]).map(s => ({
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
