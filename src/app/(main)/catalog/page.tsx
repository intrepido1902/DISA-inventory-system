import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import CatalogClient from './client';

async function getProducts() {
  const [productsRes, rollsRes] = await Promise.all([
    db.from('Product').select('id, name, code, color, width, priceOwner, priceB2B, priceB2C, active, category:categoryId(id, name)').eq('active', 1).order('name', { ascending: true }),
    db.from('Roll').select('productId, currentMeters, status').eq('status', 'ACTIVE'),
  ]);

  const products = (productsRes.data ?? []) as any[];
  const rolls = (rollsRes.data ?? []) as any[];

  const rollStats = new Map<number, { count: number; meters: number }>();
  for (const r of rolls) {
    const prev = rollStats.get(r.productId) ?? { count: 0, meters: 0 };
    rollStats.set(r.productId, { count: prev.count + 1, meters: prev.meters + (r.currentMeters as number) });
  }

  return products.map(p => ({
    id: p.id as number,
    name: p.name as string,
    code: p.code as string,
    color: p.color as string,
    width: p.width as number,
    priceOwner: p.priceOwner as number,
    priceB2B: p.priceB2B as number,
    priceB2C: p.priceB2C as number,
    category: { id: p.category?.id as number, name: p.category?.name as string },
    activeRolls: rollStats.get(p.id)?.count ?? 0,
    totalMeters: rollStats.get(p.id)?.meters ?? 0,
  }));
}

export default async function CatalogPage() {
  const session = await getSession();
  if (!canSeeCatalog(session!.role as Role)) redirect('/dashboard');
  const products = await getProducts();
  return <CatalogClient products={products} isOwner={session!.role === 'OWNER'} />;
}
