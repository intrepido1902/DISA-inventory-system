import { getSession } from '@/lib/session';
import { canSeeFinancials, type Role } from '@/lib/auth';
import { db } from '@/lib/db';
import MovementsClient from './client';

async function getMovements() {
  const { data } = await db.from('Movement').select(`
    id, type, meters, notes, barcodeUsed, createdAt,
    roll:rollId(rollNumber, barcode, product:productId(name, code, color, priceB2B)),
    user:userId(name),
    sale:saleId(client:clientId(name, type))
  `).order('createdAt', { ascending: false }).limit(200);

  return (data ?? []).map((m: any) => ({
    id: m.id as number,
    type: m.type as string,
    meters: m.meters as number,
    notes: m.notes as string | null,
    barcodeUsed: Boolean(m.barcodeUsed),
    createdAt: m.createdAt as number,
    rollNumber: m.roll?.rollNumber as string ?? '',
    productName: m.roll?.product?.name as string ?? '',
    productCode: m.roll?.product?.code as string ?? '',
    color: m.roll?.product?.color as string ?? '',
    priceB2B: m.roll?.product?.priceB2B as number ?? 0,
    userName: m.user?.name as string ?? '',
    clientName: m.sale?.client?.name as string | null ?? null,
    clientType: m.sale?.client?.type as string | null ?? null,
  }));
}

export default async function MovementsPage() {
  const session = await getSession();
  const movements = await getMovements();
  const isOwner = canSeeFinancials(session!.role as Role);
  return <MovementsClient movements={movements} isOwner={isOwner} />;
}
