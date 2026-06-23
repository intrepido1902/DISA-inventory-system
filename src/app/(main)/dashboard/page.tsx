import { getSession } from '@/lib/session';
import { canSeeFinancials, type Role } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatColombianDate } from '@/lib/dateUtils';
import LowStockPanel from './LowStockPanel';

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}
function formatMeters(n: number) {
  return `${Number(n).toLocaleString('es-CO')} m`;
}

async function getDashboardData(role: string) {
  const isOwner = canSeeFinancials(role as Role);
  const isManager = role === 'OWNER' || role === 'ADMIN';
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // BUG 2 FIX: use count:exact + head:true so Supabase returns the real count
  // without fetching rows (bypasses the 1000-row default limit).
  const [
    activeCountRes,
    remnantCountRes,
    activeProductIdsRes,
    allProductsRes,
    todayMovRes,
    monthMovRes,
  ] = await Promise.all([
    db.from('Roll').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    db.from('Roll').select('*', { count: 'exact', head: true }).eq('status', 'REMNANT'),
    // Fetch only productId for per-product stats; limit 5000 to cover all rolls
    (db as any).from('Roll').select('productId').eq('status', 'ACTIVE').limit(5000),
    db.from('Product').select('id, name, code, categoryId, category:categoryId(id, name)').eq('active', 1),
    db.from('Movement').select(`
      id, type, meters, createdAt,
      roll:rollId(rollNumber, product:productId(name, code, color)),
      user:userId(name),
      sale:saleId(client:clientId(name), total)
    `).gte('createdAt', dayStart).order('createdAt', { ascending: false }).limit(20),
    isManager
      ? db.from('Movement').select(`
          id, type, meters, createdAt,
          roll:rollId(productId),
          sale:saleId(clientId, total)
        `).in('type', ['EXIT_FULL', 'EXIT_PARTIAL']).gte('createdAt', thirtyDaysAgo)
      : Promise.resolve({ data: [] }),
  ]);

  const totalActiveRolls = activeCountRes.count ?? 0;
  const totalRemnantRolls = remnantCountRes.count ?? 0;

  const activeProductIds = ((activeProductIdsRes as any).data ?? []) as { productId: number }[];
  const allProducts = (allProductsRes.data ?? []) as any[];
  const todayMov = (todayMovRes.data ?? []) as any[];
  const monthMov = ((monthMovRes as any).data ?? []) as any[];

  // Rolls per product (active only)
  const activeRollsPerProduct = new Map<number, number>();
  for (const r of activeProductIds) {
    activeRollsPerProduct.set(r.productId, (activeRollsPerProduct.get(r.productId) ?? 0) + 1);
  }

  // Low stock: products with fewer than 5 active rolls, sorted critical-first
  const lowStockProducts = allProducts
    .filter((p: any) => (activeRollsPerProduct.get(p.id) ?? 0) < 5)
    .map((p: any) => ({
      name: p.name,
      code: p.code,
      activeRolls: activeRollsPerProduct.get(p.id) ?? 0,
    }))
    .sort((a: any, b: any) => a.activeRolls - b.activeRolls);

  // Most stocked product
  let mostStockedProduct: { name: string; code: string; activeRolls: number } | null = null;
  let maxRolls = 0;
  for (const p of allProducts) {
    const count = activeRollsPerProduct.get(p.id) ?? 0;
    if (count > maxRolls) {
      maxRolls = count;
      mostStockedProduct = { name: p.name, code: p.code, activeRolls: count };
    }
  }

  // Last 30 days sales analysis
  let topProductLastMonth: { name: string; code: string; meters: number } | null = null;
  let totalMetersThisMonth = 0;
  const productMetersLastMonth = new Map<number, number>();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  for (const m of monthMov) {
    const meters = (m.meters as number) ?? 0;
    const ts = m.createdAt as number;
    if (ts >= monthStart) totalMetersThisMonth += meters;
    const productId = m.roll?.productId;
    if (productId) productMetersLastMonth.set(productId, (productMetersLastMonth.get(productId) ?? 0) + meters);
  }

  let maxMeters = 0;
  for (const [pid, meters] of productMetersLastMonth) {
    if (meters > maxMeters) {
      maxMeters = meters;
      const p = allProducts.find((x: any) => x.id === pid);
      topProductLastMonth = p ? { name: p.name, code: p.code, meters } : null;
    }
  }

  // Today's movements
  const todayMovements = todayMov.map((m: any) => ({
    id: m.id, type: m.type, meters: m.meters, createdAt: m.createdAt,
    rollNumber: m.roll?.rollNumber ?? '',
    productName: m.roll?.product?.name ?? '',
    color: m.roll?.product?.color ?? '',
    saleTotal: m.sale?.total ?? null,
    userName: m.user?.name ?? '',
    clientName: m.sale?.client?.name ?? null,
  }));

  const dayTotal = isOwner
    ? todayMovements
        .filter(m => m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL')
        .reduce((sum, m) => sum + (m.saleTotal ?? 0), 0)
    : null;

  return {
    totalActiveRolls, totalRemnantRolls,
    lowStockProducts, mostStockedProduct,
    topProductLastMonth, totalMetersThisMonth,
    todayMovements, dayTotal, isOwner, isManager,
  };
}

export default async function DashboardPage() {
  const session = await getSession();
  const data = await getDashboardData(session!.role);
  const today = new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const MOVE_TYPE_LABEL: Record<string, string> = {
    ENTRY: 'Entrada', EXIT_FULL: 'Salida total', EXIT_PARTIAL: 'Salida parcial',
    ADJUSTMENT: 'Ajuste', WRITE_OFF: 'Baja', RETURN: 'Devolución',
  };
  const MOVE_TYPE_COLOR: Record<string, string> = {
    ENTRY: 'text-green-600 bg-green-50', EXIT_FULL: 'text-red-600 bg-red-50',
    EXIT_PARTIAL: 'text-orange-600 bg-orange-50', ADJUSTMENT: 'text-blue-600 bg-blue-50',
    WRITE_OFF: 'text-gray-600 bg-gray-100', RETURN: 'text-green-600 bg-green-50',
  };

  const exitMovements = data.todayMovements.filter(m => m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL');

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
          Hola, {session!.name.split(' ')[0]}
        </h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">{today}</p>
      </div>

      {/* Low stock alert — expandable (Client Component) */}
      {data.lowStockProducts.length > 0 && (
        <LowStockPanel products={data.lowStockProducts} />
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
        <StatCard label="Rollos activos" value={String(data.totalActiveRolls)} sub="en bodega" />
        <StatCard label="Remanentes" value={String(data.totalRemnantRolls)} sub="rollos con corte" />
        {data.isManager && (
          <>
            <StatCard
              label="Ref. con stock bajo"
              value={String(data.lowStockProducts.length)}
              sub="< 5 rollos activos"
              warn={data.lowStockProducts.length > 0}
            />
            {/* Cambio 3B: show reference code first, then roll count below */}
            <StatCard
              label="Mayor stock"
              value={data.mostStockedProduct ? data.mostStockedProduct.code.split('-')[0] : '—'}
              sub={data.mostStockedProduct ? `${data.mostStockedProduct.activeRolls} rollos activos` : 'Sin datos'}
            />
            <StatCard
              label="Más vendido (30 días)"
              value={data.topProductLastMonth ? data.topProductLastMonth.code.split('-')[0] : '—'}
              sub={data.topProductLastMonth
                ? `${data.topProductLastMonth.name} · ${formatMeters(data.topProductLastMonth.meters)}`
                : 'Sin ventas'}
            />
            <StatCard
              label="Metros vendidos este mes"
              value={formatMeters(data.totalMetersThisMonth)}
              sub="salidas del mes actual"
            />
          </>
        )}
      </div>

      {/* Today movements */}
      <div className="bg-white rounded-lg border border-[#E5E5E5]">
        <div className="px-4 lg:px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Movimientos de hoy</h2>
            <p className="text-xs text-gray-500 mt-0.5">{data.todayMovements.length} registros</p>
          </div>
          {data.isOwner && data.dayTotal !== null && exitMovements.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total ventas hoy</p>
              <p className="text-base lg:text-lg font-bold text-gray-900">{formatCOP(data.dayTotal)}</p>
            </div>
          )}
        </div>
        {data.todayMovements.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">No hay movimientos registrados hoy</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Hora</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Rollo</th>
                  <th className="px-4 py-3 text-right">Metros</th>
                  {data.isOwner && <th className="px-4 py-3 text-right">Valor</th>}
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {data.todayMovements.map((m: any) => {
                  const isExit = m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL';
                  return (
                    <tr key={m.id} className="border-b border-[#F0F0F0] hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 tabular-nums text-xs">
                        {formatColombianDate(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${MOVE_TYPE_COLOR[m.type] ?? 'text-gray-600 bg-gray-100'}`}>
                          {MOVE_TYPE_LABEL[m.type] ?? m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 text-xs">{m.productName} <span className="text-gray-400">· {m.color}</span></td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.rollNumber}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">{m.meters} m</td>
                      {data.isOwner && (
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">
                          {isExit && m.saleTotal ? formatCOP(m.saleTotal) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600 text-xs">{m.clientName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{m.userName}</td>
                    </tr>
                  );
                })}
              </tbody>
              {data.isOwner && exitMovements.length > 0 && data.dayTotal !== null && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total ventas del día</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCOP(data.dayTotal)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, warn = false,
}: {
  label: string; value: string; sub: string; warn?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 lg:p-5 ${warn ? 'border-amber-200 bg-amber-50' : 'bg-white border-[#E5E5E5]'}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl lg:text-2xl font-bold mt-1 ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1 truncate">{sub}</p>
    </div>
  );
}
