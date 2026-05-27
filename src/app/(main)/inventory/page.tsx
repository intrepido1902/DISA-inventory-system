import { getSession } from '@/lib/session';
import db from '@/lib/db';
import InventoryClient from './client';

async function getInventoryData() {
  const [rollsResult, clientsResult, productsResult, lotsResult] = await Promise.all([
    db.execute(`
      SELECT
        r.id, r.rollNumber, r.barcode, r.initialMeters, r.currentMeters,
        r.location, r.status, r.isRemnant, r.updatedAt,
        p.id as productId, p.name as productName, p.code as productCode,
        p.color, p.width, p.priceOwner, p.priceB2B, p.priceB2C,
        c.id as categoryId, c.name as categoryName,
        l.id as lotId, l.lotNumber
      FROM Roll r
      JOIN Product p ON r.productId = p.id
      JOIN Category c ON p.categoryId = c.id
      LEFT JOIN ImportLot l ON r.lotId = l.id
      ORDER BY r.status ASC, r.updatedAt DESC
    `),
    db.execute('SELECT id, name, type FROM Client WHERE active = 1 ORDER BY name'),
    db.execute('SELECT id, name, code, color, width FROM Product WHERE active = 1 ORDER BY name'),
    db.execute('SELECT id, lotNumber FROM ImportLot ORDER BY importDate DESC'),
  ]);

  const rolls = rollsResult.rows.map(r => ({
    id: r.id as number,
    rollNumber: r.rollNumber as string,
    barcode: r.barcode as string | null,
    initialMeters: r.initialMeters as number,
    currentMeters: r.currentMeters as number,
    location: r.location as string,
    status: r.status as string,
    isRemnant: r.isRemnant === 1,
    updatedAt: r.updatedAt as number,
    product: {
      id: r.productId as number,
      name: r.productName as string,
      code: r.productCode as string,
      color: r.color as string,
      width: r.width as number,
      priceOwner: r.priceOwner as number,
      priceB2B: r.priceB2B as number,
      priceB2C: r.priceB2C as number,
    },
    category: { id: r.categoryId as number, name: r.categoryName as string },
    lot: { id: r.lotId as number | null, lotNumber: r.lotNumber as string | null },
  }));

  return {
    rolls,
    clients: clientsResult.rows as unknown as { id: number; name: string; type: string }[],
    products: productsResult.rows as unknown as { id: number; name: string; code: string; color: string; width: number }[],
    lots: lotsResult.rows as unknown as { id: number; lotNumber: string }[],
  };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; exitModal?: string }>;
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
    />
  );
}
