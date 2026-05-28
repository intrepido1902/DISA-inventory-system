import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import CatalogClient from './client';

async function getProducts() {
  const result = await pool.query(`
    SELECT
      p.id, p.name, p.code, p.color, p.width,
      p."priceOwner", p."priceB2B", p."priceB2C", p.active,
      c.id as "categoryId", c.name as "categoryName",
      COUNT(CASE WHEN r.status = 'ACTIVE' THEN 1 END) as "activeRolls",
      COALESCE(SUM(CASE WHEN r.status = 'ACTIVE' THEN r."currentMeters" END), 0) as "totalMeters"
    FROM "Product" p
    JOIN "Category" c ON p."categoryId" = c.id
    LEFT JOIN "Roll" r ON r."productId" = p.id
    WHERE p.active = 1
    GROUP BY p.id, p.name, p.code, p.color, p.width, p."priceOwner", p."priceB2B", p."priceB2C", p.active, c.id, c.name
    ORDER BY c.name, p.name
  `);

  return result.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    code: r.code as string,
    color: r.color as string,
    width: r.width as number,
    priceOwner: r.priceOwner as number,
    priceB2B: r.priceB2B as number,
    priceB2C: r.priceB2C as number,
    category: { id: r.categoryId as number, name: r.categoryName as string },
    activeRolls: r.activeRolls as number,
    totalMeters: r.totalMeters as number,
  }));
}

export default async function CatalogPage() {
  const session = await getSession();
  if (!canSeeCatalog(session!.role as Role)) redirect('/dashboard');
  const products = await getProducts();
  const isOwner = session!.role === 'OWNER';
  return <CatalogClient products={products} isOwner={isOwner} />;
}
