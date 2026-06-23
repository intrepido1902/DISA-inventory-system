import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const dbAny = db as any;

    // All DECORATOR clients
    const { data: decorators } = await dbAny
      .from('Client')
      .select('id')
      .in('type', ['DECORATOR', 'OCCASIONAL'])
      .eq('active', 1);

    if (!decorators || decorators.length === 0) return Response.json([]);

    const decoratorIds: number[] = decorators.map((d: any) => d.id as number);

    // All sales for these clients
    const { data: sales } = await dbAny
      .from('Sale')
      .select('id, clientId, createdAt, total')
      .in('clientId', decoratorIds)
      .order('createdAt', { ascending: false });

    if (!sales || sales.length === 0) return Response.json([]);

    const saleIds: number[] = sales.map((s: any) => s.id as number);

    // Exit movements for these sales (meters + pricePerMeter)
    const { data: movements } = await dbAny
      .from('Movement')
      .select('saleId, meters, pricePerMeter')
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .in('saleId', saleIds);

    const movBySale = new Map<number, { meters: number; pricePerMeter: number | null }>();
    for (const m of movements ?? []) {
      movBySale.set(m.saleId, { meters: m.meters ?? 0, pricePerMeter: m.pricePerMeter ?? null });
    }

    // Aggregate per client
    const stats = new Map<number, {
      clientId: number;
      lastPurchaseDate: number;
      totalMeters: number;
      lastPricePerMeter: number | null;
    }>();

    for (const s of sales) {
      const existing = stats.get(s.clientId);
      const mov = movBySale.get(s.id);
      const meters = mov?.meters ?? 0;

      if (!existing) {
        stats.set(s.clientId, {
          clientId: s.clientId,
          lastPurchaseDate: s.createdAt ?? 0,
          totalMeters: meters,
          lastPricePerMeter: mov?.pricePerMeter ?? null,
        });
      } else {
        existing.totalMeters += meters;
        // sales are sorted desc, so first hit per client = most recent
      }
    }

    return Response.json([...stats.values()]);
  } catch (err) {
    console.error('GET /api/clients/sales-stats error:', err);
    return Response.json({ error: 'Error al obtener estadísticas' }, { status: 500 });
  }
}
