import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { buildCodeFilter } from '@/lib/productFamily';
import InventoryClient from './client';

const ROLL_SELECT = `
  id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
  location, status, isRemnant, updatedAt,
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

async function getInventoryData(isRemnantTab: boolean, search = '') {
  // Pre-compute product IDs matching search (reference code filter)
  let searchProductIds: number[] | null = null;
  if (search) {
    const { data: pRows } = await db.from('Product').select('id').or(buildCodeFilter(search));
    searchProductIds = (pRows ?? []).map((p: any) => p.id as number);
  }

  let rollQuery = db.from('Roll').select(ROLL_SELECT, { count: 'exact' });

  if (isRemnantTab) {
    rollQuery = rollQuery.eq('status', 'REMNANT');
  } else {
    // TAREA 4: hide DEPLETED by default
    rollQuery = rollQuery.neq('status', 'DEPLETED');
  }
  if (searchProductIds !== null) {
    if (searchProductIds.length === 0) {
      // No products match the search — force empty rolls result
      rollQuery = rollQuery.lt('id', 0);
    } else {
      rollQuery = rollQuery.in('productId', searchProductIds);
    }
  }
  rollQuery = rollQuery.order('id', { ascending: true });

  // TAREA 3: totalMeters query (entire filtered set, no pagination)
  let totalMetersQuery = db.from('Roll').select('currentMeters');
  if (isRemnantTab) {
    totalMetersQuery = totalMetersQuery.eq('status', 'REMNANT');
  } else {
    totalMetersQuery = totalMetersQuery.neq('status', 'DEPLETED');
  }
  if (searchProductIds !== null && searchProductIds.length > 0) {
    totalMetersQuery = totalMetersQuery.in('productId', searchProductIds);
  }

  const [rollsRes, clientsRes, productsRes, lotsRes, remCountRes, activeCountRes, metersRes] = await Promise.all([
    rollQuery.range(0, 99),
    db.from('Client').select('id, name, type, sellsByRoll').eq('active', 1).order('name', { ascending: true }),
    db.from('Product').select('id, name, code, color, width, categoryId').eq('active', 1).order('name', { ascending: true }),
    db.from('ImportLot').select('id, lotNumber').order('importDate', { ascending: false }),
    db.from('Roll').select('id', { count: 'exact', head: true }).eq('status', 'REMNANT'),
    db.from('Roll').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    searchProductIds?.length === 0 ? Promise.resolve({ data: [] }) : totalMetersQuery,
  ]);

  const total = rollsRes.count ?? 0;
  const limit = 100;
  const totalMeters = ((metersRes as any).data ?? []).reduce(
    (sum: number, r: any) => sum + (Number(r.currentMeters) || 0), 0,
  );

  return {
    rolls: (rollsRes.data ?? []).map(mapRoll),
    total,
    totalMeters,
    totalPages: Math.ceil(total / limit),
    remnantCount: remCountRes.count ?? 0,
    activeCount: activeCountRes.count ?? 0,
    clients: (clientsRes.data ?? []).map((r: any) => ({
      id: r.id as number,
      name: r.name as string,
      type: r.type as string,
      sellsByRoll: Boolean(r.sellsByRoll),
    })),
    products: (productsRes.data ?? []).map((r: any) => ({
      id: r.id as number,
      name: r.name as string,
      code: r.code as string,
      color: r.color as string,
      width: r.width as number,
      categoryId: r.categoryId as number,
    })),
    lots: (lotsRes.data ?? []).map((r: any) => ({
      id: r.id as number,
      lotNumber: r.lotNumber as string,
    })),
  };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    exitModal?: string;
    q?: string;
    cat?: string;
    family?: string;
    status?: string;
    color?: string;
    width?: string;
    minM?: string;
    maxM?: string;
    rollNum?: string;
    depleted?: string;
    loc?: string;
  }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const isRemnantTab = sp.tab === 'remnants';
  const data = await getInventoryData(isRemnantTab, sp.q ?? '');

  return (
    <InventoryClient
      initialRolls={data.rolls}
      initialTotal={data.total}
      initialTotalMeters={data.totalMeters}
      initialTotalPages={data.totalPages}
      initialRemnantCount={data.remnantCount}
      initialActiveCount={data.activeCount}
      clients={data.clients}
      products={data.products}
      lots={data.lots}
      userRole={session!.role}
      userName={session!.name}
      initialTab={isRemnantTab ? 'remnants' : 'all'}
      openExitModal={sp.exitModal === '1'}
      initialSearch={sp.q ?? ''}
      initialFamily={sp.family ?? ''}
      initialStatus={sp.status ?? ''}
      initialColor={sp.color ?? ''}
      initialWidth={sp.width ?? ''}
      initialMinMeters={sp.minM ?? ''}
      initialMaxMeters={sp.maxM ?? ''}
      initialRollNumber={sp.rollNum ?? ''}
      initialShowDepleted={sp.depleted === 'true'}
    />
  );
}
