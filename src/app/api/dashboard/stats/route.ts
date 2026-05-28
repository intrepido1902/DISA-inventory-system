import { getSession } from '@/lib/session';
import { canSeeFinancials, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const isOwner = canSeeFinancials(session.role as Role);
  const dayStart = new Date().setHours(0, 0, 0, 0);

  try {
    const [activeRollsRes, allProductsRes, todayMovRes] = await Promise.all([
      db.from('Roll').select('id, currentMeters, productId, isRemnant').eq('status', 'ACTIVE'),
      db.from('Product').select('id, name, code, priceB2B, category:categoryId(id, name)').eq('active', 1),
      db.from('Movement').select(`
        id, type, meters, createdAt,
        roll:rollId(rollNumber, product:productId(name, color, priceB2B)),
        user:userId(name),
        sale:saleId(client:clientId(name))
      `).gte('createdAt', dayStart).order('createdAt', { ascending: false }).limit(20),
    ]);

    const activeRolls = (activeRollsRes.data ?? []) as any[];
    const allProducts = (allProductsRes.data ?? []) as any[];
    const todayMov = (todayMovRes.data ?? []) as any[];

    const productMap = new Map(allProducts.map(p => [p.id, p]));

    const totalMeters = activeRolls.reduce((s, r) => s + (r.currentMeters as number), 0);
    const totalRolls = activeRolls.length;
    const totalProducts = new Set(activeRolls.map(r => r.productId)).size;
    const remnants = activeRolls.filter(r => r.isRemnant === 1).length;

    const catMap = new Map<number, { name: string; rolls: number; meters: number }>();
    for (const roll of activeRolls) {
      const p = productMap.get(roll.productId) as any;
      if (!p?.category) continue;
      const existing = catMap.get(p.category.id) ?? { name: p.category.name, rolls: 0, meters: 0 };
      catMap.set(p.category.id, { name: p.category.name, rolls: existing.rolls + 1, meters: existing.meters + (roll.currentMeters as number) });
    }
    const byCategory = Array.from(catMap.values());

    const productMeters = new Map<number, number>();
    for (const roll of activeRolls) {
      productMeters.set(roll.productId, (productMeters.get(roll.productId) ?? 0) + (roll.currentMeters as number));
    }
    const lowStock = allProducts
      .filter(p => (productMeters.get(p.id) ?? 0) < 100)
      .map(p => ({ name: p.name, code: p.code, totalMeters: productMeters.get(p.id) ?? 0 }))
      .sort((a, b) => a.totalMeters - b.totalMeters)
      .slice(0, 5);

    const todayMovements = todayMov.map(m => ({
      id: m.id,
      type: m.type,
      meters: m.meters,
      createdAt: m.createdAt,
      rollNumber: m.roll?.rollNumber ?? '',
      productName: m.roll?.product?.name ?? '',
      color: m.roll?.product?.color ?? '',
      priceB2B: m.roll?.product?.priceB2B ?? 0,
      userName: m.user?.name ?? '',
      clientName: m.sale?.client?.name ?? null,
    }));

    const stats: Record<string, unknown> = {
      totalMeters, totalRolls, totalProducts, byCategory, remnants, lowStock, todayMovements,
    };

    if (isOwner) {
      stats.inventoryValue = activeRolls.reduce((sum, roll) => {
        const p = productMap.get(roll.productId) as any;
        return sum + (roll.currentMeters as number) * ((p?.priceB2B as number) ?? 0);
      }, 0);
      stats.dayTotal = todayMovements
        .filter(m => m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL')
        .reduce((sum, m) => sum + m.meters * m.priceB2B, 0);
    }

    return Response.json(stats);
  } catch (err) {
    console.error('GET /api/dashboard/stats error:', err);
    return Response.json({ error: 'Error al obtener estadísticas' }, { status: 500 });
  }
}
