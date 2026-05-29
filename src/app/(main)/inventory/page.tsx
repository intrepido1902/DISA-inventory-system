import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import InventoryClient from './client';

const ROLL_SELECT = `
  id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
  location, status, isRemnant, updatedAt,
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

async function getInventoryData(isRemnantTab: boolean) {
  let rollQuery = db.from('Roll').select(ROLL_SELECT, { count: 'exact' });

  if (isRemnantTab) {
    rollQuery = rollQuery.eq('status', 'REMNANT').order('currentMeters', { ascending: true });
  } else {
    rollQuery = rollQuery.order('status', { ascending: true }).order('updatedAt', { ascending: false });
  }

  const [rollsRes, clientsRes, productsRes, lotsRes, remCountRes, activeCountRes] = await Promise.all([
    rollQuery.range(0, 99),
    db.from('Client').select('id, name, type, pricePerMeter').eq('active', 1).order('name', { ascending: true }),
    db.from('Product').select('id, name, code, color, width, categoryId').eq('active', 1).order('name', { ascending: true }),
    db.from('ImportLot').select('id, lotNumber').order('importDate', { ascending: false }),
    db.from('Roll').select('id', { count: 'exact', head: true }).eq('status', 'REMNANT'),
    db.from('Roll').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
  ]);

  const total = rollsRes.count ?? 0;
  const limit = 100;

  return {
    rolls: (rollsRes.data ?? []).map(mapRoll),
    total,
    totalPages: Math.ceil(total / limit),
    remnantCount: remCountRes.count ?? 0,
    activeCount: activeCountRes.count ?? 0,
    clients: (clientsRes.data ?? []).map((r: any) => ({
      id: r.id as number,
      name: r.name as string,
      type: r.type as string,
      pricePerMeter: (r.pricePerMeter ?? null) as number | null,
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
    status?: string;
    color?: string;
    minM?: string;
    maxM?: string;
    loc?: string;
  }>;
}) {
  const session = await getSession();
  const sp = await searchParams;
  const isRemnantTab = sp.tab === 'remnants';
  const data = await getInventoryData(isRemnantTab);

  return (
    <InventoryClient
      initialRolls={data.rolls}
      initialTotal={data.total}
      initialTotalPages={data.totalPages}
      initialRemnantCount={data.remnantCount}
      initialActiveCount={data.activeCount}
      clients={data.clients}
      products={data.products}
      lots={data.lots}
      userRole={session!.role}
      initialTab={isRemnantTab ? 'remnants' : 'all'}
      openExitModal={sp.exitModal === '1'}
      initialSearch={sp.q ?? ''}
      initialCategory={sp.cat ?? ''}
      initialStatus={sp.status ?? ''}
      initialColor={sp.color ?? ''}
      initialMinMeters={sp.minM ?? ''}
      initialMaxMeters={sp.maxM ?? ''}
      initialLocation={sp.loc ?? ''}
    />
  );
}
