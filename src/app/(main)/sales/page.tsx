import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import SalesClient from './client';

const LIMIT = 50;

async function getSalesData(clientId = '', dateFrom = '', dateTo = '') {
  const dbAny = db as any;

  let saleQuery = dbAny
    .from('Sale')
    .select('id, clientId, clientName, date, subtotal, discount, total, createdAt', { count: 'exact' });

  if (clientId)  saleQuery = saleQuery.eq('clientId', Number(clientId));
  if (dateFrom)  saleQuery = saleQuery.gte('createdAt', new Date(dateFrom).setHours(0, 0, 0, 0));
  if (dateTo)    saleQuery = saleQuery.lte('createdAt', new Date(dateTo).setHours(23, 59, 59, 999));

  const [saleRes, clientsRes] = await Promise.all([
    saleQuery.order('createdAt', { ascending: false }).range(0, LIMIT - 1),
    dbAny.from('Client').select('id, name').eq('active', 1).order('name', { ascending: true }),
  ]);

  const sales = (saleRes.data ?? []) as any[];
  const total = saleRes.count ?? 0;

  // Fetch movements for the first page
  const rollCounts = new Map<number, { rollCount: number; totalMeters: number }>();
  if (sales.length > 0) {
    const saleIds = sales.map((s: any) => s.id as number);
    const { data: movements } = await dbAny
      .from('Movement')
      .select('saleId, rollId, meters')
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .in('saleId', saleIds);

    for (const m of movements ?? []) {
      const agg = rollCounts.get(m.saleId as number);
      if (agg) { agg.rollCount++; agg.totalMeters += Number(m.meters ?? 0); }
      else rollCounts.set(m.saleId as number, { rollCount: 1, totalMeters: Number(m.meters ?? 0) });
    }
  }

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
