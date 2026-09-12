import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import SalesClient from './client';

const LIMIT = 50;

async function getSalesData(clientId = '', dateFrom = '', dateTo = '') {
  const dbAny = db as any;

  // Shared filters applied both to the paginated Sale fetch and to the "all matching ids"
  // query used below to compute the true (non-voided) count.
  function applySaleFilters(q: any) {
    if (clientId) q = q.eq('clientId', Number(clientId));
    if (dateFrom) q = q.gte('createdAt', new Date(dateFrom).setHours(0, 0, 0, 0));
    if (dateTo)   q = q.lte('createdAt', new Date(dateTo).setHours(23, 59, 59, 999));
    return q;
  }

  const [saleRes, clientsRes] = await Promise.all([
    applySaleFilters(
      dbAny.from('Sale').select('id, clientId, clientName, date, subtotal, discount, total, createdAt')
    ).order('createdAt', { ascending: false }).range(0, LIMIT - 1),
    dbAny.from('Client').select('id, name').eq('active', 1).order('name', { ascending: true }),
  ]);

  const allSales = (saleRes.data ?? []) as any[];

  // True total: Sale.count('exact') includes fully-voided sales (every movement reverted).
  // Count distinct saleIds — across ALL pages matching the filters, not just this one —
  // that still have at least one non-reverted exit movement. Same approach as
  // GET /api/sales (commit f4d946f).
  const { data: allSaleIdRows } = await applySaleFilters(
    dbAny.from('Sale').select('id').limit(10000)
  );
  const allSaleIds = (allSaleIdRows ?? []).map((r: any) => r.id as number);

  const activeSaleIds = new Set<number>();
  const CHUNK = 500;
  for (let i = 0; i < allSaleIds.length; i += CHUNK) {
    const chunk = allSaleIds.slice(i, i + CHUNK);
    const { data: activeRows } = await dbAny
      .from('Movement')
      .select('saleId')
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .neq('reverted', true)
      .in('saleId', chunk);
    for (const r of activeRows ?? []) activeSaleIds.add(r.saleId as number);
  }

  const total = activeSaleIds.size;

  // Fetch movements for the first page — same logic as GET /api/sales: exclude reverted
  // (anulado) movements so fully-voided sales don't show up on initial load.
  const rollCounts = new Map<number, { rollCount: number; totalMeters: number }>();
  if (allSales.length > 0) {
    const saleIds = allSales.map((s: any) => s.id as number);
    const { data: movements } = await dbAny
      .from('Movement')
      .select('saleId, rollId, meters')
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .neq('reverted', true)
      .in('saleId', saleIds);

    for (const m of movements ?? []) {
      const agg = rollCounts.get(m.saleId as number);
      if (agg) { agg.rollCount++; agg.totalMeters += Number(m.meters ?? 0); }
      else rollCounts.set(m.saleId as number, { rollCount: 1, totalMeters: Number(m.meters ?? 0) });
    }
  }

  // Only sales with at least one active (non-reverted) exit movement — a fully-voided
  // sale has no entry in rollCounts.
  const sales = allSales.filter((s: any) => rollCounts.has(s.id as number));

  return {
    sales: sales.map((s: any) => ({
      id:          s.id          as number,
      clientId:    s.clientId    as number,
      clientName:  s.clientName  as string,
      date:        s.date        as string,
      subtotal:    s.subtotal    as number,
      discount:    s.discount    as number,
      total:       s.total       as number,
      createdAt:   s.createdAt   as number,
      rollCount:   rollCounts.get(s.id as number)?.rollCount   ?? 0,
      totalMeters: rollCounts.get(s.id as number)?.totalMeters ?? 0,
    })),
    total,
    totalPages: Math.ceil(total / LIMIT),
    clients: (clientsRes.data ?? []).map((c: any) => ({ id: c.id as number, name: c.name as string })),
  };
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await getSession();
  if (!canSeeCatalog(session!.role as Role)) redirect('/dashboard');

  const sp = await searchParams;
  const data = await getSalesData(sp.clientId ?? '', sp.dateFrom ?? '', sp.dateTo ?? '');

  return (
    <SalesClient
      initialSales={data.sales}
      initialTotal={data.total}
      initialTotalPages={data.totalPages}
      clients={data.clients}
      initialClientId={sp.clientId ?? ''}
      initialDateFrom={sp.dateFrom ?? ''}
      initialDateTo={sp.dateTo ?? ''}
      isOwner={session!.role === 'OWNER'}
    />
  );
}
