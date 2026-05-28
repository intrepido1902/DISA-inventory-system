import { getSession } from '@/lib/session';
import { canSeeFinancials, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}
function formatMeters(n: number) {
  return `${Number(n).toLocaleString('es-CO')} m`;
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

async function getDashboardData(role: string) {
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const isOwner = canSeeFinancials(role as Role);

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

  const productMap = new Map(allProducts.map((p: any) => [p.id as number, p]));

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
    .filter((p: any) => (productMeters.get(p.id) ?? 0) < 100)
    .map((p: any) => ({ name: p.name, code: p.code, totalMeters: productMeters.get(p.id) ?? 0 }))
    .sort((a: any, b: any) => a.totalMeters - b.totalMeters)
    .slice(0, 5);

  const todayMovements = todayMov.map((m: any) => ({
    id: m.id, type: m.type, meters: m.meters, createdAt: m.createdAt,
    rollNumber: m.roll?.rollNumber ?? '', productName: m.roll?.product?.name ?? '',
    color: m.roll?.product?.color ?? '', priceB2B: m.roll?.product?.priceB2B ?? 0,
    userName: m.user?.name ?? '', clientName: m.sale?.client?.name ?? null,
  }));

  let inventoryValue: number | null = null;
  let dayTotal: number | null = null;
  if (isOwner) {
    inventoryValue = activeRolls.reduce((sum, roll) => {
      const p = productMap.get(roll.productId) as any;
      return sum + (roll.currentMeters as number) * ((p?.priceB2B as number) ?? 0);
    }, 0);
    dayTotal = todayMovements
      .filter(m => m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL')
      .reduce((sum, m) => sum + m.meters * m.priceB2B, 0);
  }

  return { totalMeters, totalRolls, totalProducts, byCategory, remnants, lowStock, todayMovements, inventoryValue, dayTotal, isOwner };
}

export default async function DashboardPage() {
  const session = await getSession();
  const data = await getDashboardData(session!.role);
  const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const MOVE_TYPE_LABEL: Record<string, string> = { ENTRY: 'Entrada', EXIT_FULL: 'Salida total', EXIT_PARTIAL: 'Salida parcial', ADJUSTMENT: 'Ajuste', WRITE_OFF: 'Baja' };
  const MOVE_TYPE_COLOR: Record<string, string> = { ENTRY: 'text-green-600 bg-green-50', EXIT_FULL: 'text-red-600 bg-red-50', EXIT_PARTIAL: 'text-orange-600 bg-orange-50', ADJUSTMENT: 'text-blue-600 bg-blue-50', WRITE_OFF: 'text-gray-600 bg-gray-100' };
  const exitMovements = data.todayMovements.filter(m => m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL');

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Bienvenido, {session!.name.split(' ')[0]}</h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">{today}</p>
      </div>

      {data.lowStock.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-amber-800 text-sm font-medium mb-1">⚠ Referencias con stock bajo (&lt; 100 m)</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.lowStock.map((p: any) => (
              <span key={p.code} className="text-xs bg-amber-100 border border-amber-300 text-amber-700 rounded px-2 py-0.5">
                {p.name} · {formatMeters(p.totalMeters)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid — 1 col mobile, 2 cols tablet, 4 cols desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
        <StatCard label="Metros disponibles" value={formatMeters(data.totalMeters)}
          sub={data.byCategory.map((c: any) => `${c.name}: ${formatMeters(c.meters)}`).join(' · ')} />
        <StatCard label="Rollos activos" value={String(data.totalRolls)} sub="en bodega" />
        <StatCard label="Remanentes" value={String(data.remnants)} sub="rollos ≤ 10 metros" />
        <StatCard label="Referencias en stock" value={String(data.totalProducts)} sub="productos activos" />
        {data.inventoryValue !== null && (
          <div className="col-span-1 sm:col-span-2 lg:col-span-4">
            <StatCard label="Valor del inventario (precio B2B)" value={formatCOP(data.inventoryValue)}
              sub="suma de metros × precio B2B por producto" highlight />
          </div>
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
                  {data.isOwner && <th className="px-4 py-3 text-right">Precio/m</th>}
                  {data.isOwner && <th className="px-4 py-3 text-right">Valor</th>}
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {data.todayMovements.map((m: any) => {
                  const isExit = m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL';
                  const valor = isExit ? m.meters * m.priceB2B : null;
                  return (
                    <tr key={m.id} className="border-b border-[#F0F0F0] hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 tabular-nums text-xs">{formatTime(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${MOVE_TYPE_COLOR[m.type] ?? 'text-gray-600 bg-gray-100'}`}>
                          {MOVE_TYPE_LABEL[m.type] ?? m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 text-xs">{m.productName} <span className="text-gray-400">· {m.color}</span></td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.rollNumber}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">{m.meters} m</td>
                      {data.isOwner && <td className="px-4 py-3 text-right tabular-nums text-gray-500 text-xs">{isExit ? formatCOP(m.priceB2B) : '—'}</td>}
                      {data.isOwner && <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">{valor !== null ? formatCOP(valor) : '—'}</td>}
                      <td className="px-4 py-3 text-gray-600 text-xs">{m.clientName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{m.userName}</td>
                    </tr>
                  );
                })}
              </tbody>
              {data.isOwner && exitMovements.length > 0 && data.dayTotal !== null && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total ventas del día</td>
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

function StatCard({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 lg:p-5 ${highlight ? 'border-amber-200 bg-amber-50' : 'bg-white border-[#E5E5E5]'}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl lg:text-2xl font-bold mt-1 ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
