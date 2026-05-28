import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
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

    return Response.json(products.map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      color: p.color,
      width: p.width,
      priceOwner: p.priceOwner,
      priceB2B: p.priceB2B,
      priceB2C: p.priceB2C,
      active: p.active,
      category: { id: p.category?.id, name: p.category?.name },
      activeRolls: rollStats.get(p.id)?.count ?? 0,
      totalMeters: rollStats.get(p.id)?.meters ?? 0,
    })));
  } catch (err) {
    console.error('GET /api/catalog/products error:', err);
    return Response.json({ error: 'Error al obtener catálogo' }, { status: 500 });
  }
}
