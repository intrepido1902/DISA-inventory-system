import { getSession } from '@/lib/session';
import { canSeeFinancials } from '@/lib/auth';
import db from '@/lib/db';
import MovementsClient from './client';

async function getMovements() {
  const result = await db.execute(`
    SELECT
      m.id, m.type, m.meters, m.notes, m.barcodeUsed, m.createdAt,
      r.rollNumber, r.barcode,
      p.name as productName, p.code as productCode, p.color, p.priceB2B,
      u.name as userName,
      cl.name as clientName, cl.type as clientType
    FROM Movement m
    JOIN Roll r ON m.rollId = r.id
    JOIN Product p ON r.productId = p.id
    JOIN User u ON m.userId = u.id
    LEFT JOIN Sale s ON m.saleId = s.id
    LEFT JOIN Client cl ON s.clientId = cl.id
    ORDER BY m.createdAt DESC
    LIMIT 200
  `);

  return result.rows.map(r => ({
    id: r.id as number,
    type: r.type as string,
    meters: r.meters as number,
    notes: r.notes as string | null,
    barcodeUsed: r.barcodeUsed === 1,
    createdAt: r.createdAt as number,
    rollNumber: r.rollNumber as string,
    productName: r.productName as string,
    productCode: r.productCode as string,
    color: r.color as string,
    priceB2B: r.priceB2B as number,
    userName: r.userName as string,
    clientName: r.clientName as string | null,
    clientType: r.clientType as string | null,
  }));
}

export default async function MovementsPage() {
  const session = await getSession();
  const movements = await getMovements();
  const isOwner = canSeeFinancials(session!.role as 'OWNER' | 'WAREHOUSE');
  return <MovementsClient movements={movements} isOwner={isOwner} />;
}
