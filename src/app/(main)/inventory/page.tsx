import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import InventoryClient from './client';

async function getInventoryData() {
  const [rollsRes, clientsRes, productsRes, lotsRes] = await Promise.all([
    // NOTE: label_number requires SQL migration first:
    // ALTER TABLE "Roll" ADD COLUMN label_number INTEGER;
    db.from('Roll').select(`
      id, rollNumber, barcode, label_number, initialMeters, currentMeters,
      location, status, isRemnant, updatedAt,
      product:productId(id, name, code, color, width, priceOwner, priceB2B, priceB2C,
        category:categoryId(id, name)
      ),
      lot:lotId(id, lotNumber)
    `).order('status', { ascending: true }).order('updatedAt', { ascending: false }),
    db.from('Client').select('id, name, type').eq('active', 1).order('name', { ascending: true }),
    db.from('Product').select('id, name, code, color, width').eq('active', 1).order('name', { ascending: true }),
    db.from('ImportLot').select('id, lotNumber').order('importDate', { ascending: false }),
  ]);

  const rolls = (rollsRes.data ?? []).map((r: any) => ({
    id: r.id as number,
    rollNumber: r.rollNumber as string,
    barcode: r.barcode as string | null,
    labelNumber: r.label_number as number | null ?? null,
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
    category: {
      id: r.product?.category?.id as number,
      name: r.product?.category?.name as string,
    },
    lot: {
      id: r.lot?.id as number | null ?? null,
      lotNumber: r.lot?.lotNumber as string | null ?? null,
    },
  }));

  return {
    rolls,
    clients: (clientsRes.data ?? []).map((r: any) => ({
      id: r.id as number,
      name: r.name as string,
      type: r.type as string,
    })),
    products: (productsRes.data ?? []).map((r: any) => ({
      id: r.id as number,
      name: r.name as string,
      code: r.code as string,
      color: r.color as string,
      width: r.width as number,
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
  const data = await getInventoryData();

  return (
    <InventoryClient
      initialRolls={data.rolls}
      clients={data.clients}
      products={data.products}
      lots={data.lots}
      userRole={session!.role}
      initialTab={sp.tab === 'remnants' ? 'remnants' : 'all'}
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
