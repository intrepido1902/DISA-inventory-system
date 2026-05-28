import { getSession } from '@/lib/session';
import { canSeeFinancials, type Role } from '@/lib/auth';
import { pool } from '@/lib/db';

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

  const [totals, byCategory, remnants, lowStock, todayMovements] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM("currentMeters"), 0) as "totalMeters",
        COUNT(*) as "totalRolls",
        COUNT(DISTINCT "productId") as "totalProducts"
      FROM "Roll" WHERE status = 'ACTIVE'
    `),
    pool.query(`
      SELECT c.name, COUNT(r.id) as rolls, COALESCE(SUM(r."currentMeters"), 0) as meters
      FROM "Roll" r
      JOIN "Product" p ON r."productId" = p.id
      JOIN "Category" c ON p."categoryId" = c.id
      WHERE r.status = 'ACTIVE'
      GROUP BY c.id, c.name
    `),
    pool.query(`SELECT COUNT(*) as count FROM "Roll" WHERE "isRemnant" = 1 AND status = 'ACTIVE'`),
    pool.query(`
      SELECT p.name, p.code, COALESCE(SUM(r."currentMeters"), 0) as "totalMeters"
      FROM "Product" p
      LEFT JOIN "Roll" r ON r."productId" = p.id AND r.status = 'ACTIVE'
      WHERE p.active = 1
      GROUP BY p.id, p.name, p.code
      HAVING COALESCE(SUM(r."currentMeters"), 0) < 100
      ORDER BY COALESCE(SUM(r."currentMeters"), 0) ASC
      LIMIT 5
    `),
    pool.query(`
      SELECT m.id, m.type, m.meters, m."createdAt",
             r."rollNumber", p.name as "productName", p.color, p."priceB2B",
             u.name as "userName", cl.name as "clientName"
      FROM "Movement" m
      JOIN "Roll" r ON m."rollId" = r.id
      JOIN "Product" p ON r."productId" = p.id
      JOIN "User" u ON m."userId" = u.id
      LEFT JOIN "Sale" s ON m."saleId" = s.id
      LEFT JOIN "Client" cl ON s."clientId" = cl.id
      WHERE m."createdAt" >= $1
      ORDER BY m."createdAt" DESC
      LIMIT 20
    `, [dayStart]),
  ]);

  const t = totals.rows[0];

  let inventoryValue: number | null = null;
  let dayTotal: number | null = null;

  if (isOwner) {
    const [val, dayTot] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(r."currentMeters" * p."priceB2B"), 0) as v
        FROM "Roll" r JOIN "Product" p ON r."productId" = p.id
        WHERE r.status = 'ACTIVE'
      `),
      pool.query(`
        SELECT COALESCE(SUM(m.meters * p."priceB2B"), 0) as total
        FROM "Movement" m
        JOIN "Roll" r ON m."rollId" = r.id
        JOIN "Product" p ON r."productId" = p.id
        WHERE m."createdAt" >= $1 AND m.type IN ('EXIT_FULL','EXIT_PARTIAL')
      `, [dayStart]),
    ]);
    inventoryValue = val.rows[0].v as number;
    dayTotal = dayTot.rows[0].total as number;
  }

  return {
    totalMeters: t.totalMeters as number,
    totalRolls: t.totalRolls as number,
    totalProducts: t.totalProducts as number,
    byCategory: byCategory.rows,
    remnants: remnants.rows[0].count as number,
    lowStock: lowStock.rows,
    todayMovements: todayMovements.rows,
    inventoryValue,
    dayTotal,
    isOwner,
  };
}

export default async function DashboardPage() {
  const session = await getSession();
  const data = await getDashboardData(session!.role);
  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const MOVE_TYPE_LABEL: Record<string, string> = {
    ENTRY: 'Entrada',
    EXIT_FULL: 'Salida total',
    EXIT_PARTIAL: 'Salida parcial',
    ADJUSTMENT: 'Ajuste',
    WRITE_OFF: 'Baja',
  };
  const MOVE_TYPE_COLOR: Record<string, string> = {
    ENTRY: 'text-green-600 bg-green-50',
    EXIT_FULL: 'text-red-600 bg-red-50',
    EXIT_PARTIAL: 'text-orange-600 bg-orange-50',
    ADJUSTMENT: 'text-blue-600 bg-blue-50',
    WRITE_OFF: 'text-gray-600 bg-gray-100',
  };

  const exitMovements = data.todayMovements.filter(
    (m: Record<string, unknown>) => m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL'
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Bienvenido, {session!.name.split(' ')[0]}
        </h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">{today}</p>
      </div>

      {data.lowStock.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-amber-800 text-sm font-medium mb-1">⚠ Referencias con stock bajo (&lt; 100 m)</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.lowStock.map((p: Record<string, unknown>) => (
              <span key={p.code as string} className="text-xs bg-amber-100 border border-amber-300 text-amber-700 rounded px-2 py-0.5">
                {p.name as string} · {formatMeters(p.totalMeters as number)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Metros disponibles"
          value={formatMeters(data.totalMeters)}
          sub={`${data.byCategory.map((c: Record<string, unknown>) => `${c.name}: ${formatMeters(c.meters as number)}`).join(' · ')}`}
        />
        <StatCard
          label="Rollos activos"
          value={String(data.totalRolls)}
          sub="en bodega"
        />
        <StatCard
          label="Remanentes"
          value={String(data.remnants)}
          sub="rollos ≤ 10 metros"
        />
        <StatCard
          label="Referencias en stock"
          value={String(data.totalProducts)}
          sub="productos activos"
        />
        {data.inventoryValue !== null && (
          <div className="col-span-2 lg:col-span-4">
            <StatCard
              label="Valor del inventario (precio B2B)"
              value={formatCOP(data.inventoryValue)}
              sub="suma de metros × precio B2B por producto"
              highlight
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5]">
        <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Movimientos de hoy</h2>
            <p className="text-xs text-gray-500 mt-0.5">{data.todayMovements.length} registros</p>
          </div>
          {data.isOwner && data.dayTotal !== null && exitMovements.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total ventas hoy</p>
              <p className="text-lg font-bold text-gray-900">{formatCOP(data.dayTotal)}</p>
            </div>
          )}
        </div>

        {data.todayMovements.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            No hay movimientos registrados hoy
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Hora</th>
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Producto</th>
                  <th className="px-5 py-3 text-left">Rollo</th>
                  <th className="px-5 py-3 text-right">Metros</th>
                  {data.isOwner && <th className="px-5 py-3 text-right">Precio/m</th>}
                  {data.isOwner && <th className="px-5 py-3 text-right">Valor</th>}
                  <th className="px-5 py-3 text-left">Cliente</th>
                  <th className="px-5 py-3 text-left">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {data.todayMovements.map((m: Record<string, unknown>) => {
                  const isExit = m.type === 'EXIT_FULL' || m.type === 'EXIT_PARTIAL';
                  const valor = isExit ? (m.meters as number) * (m.priceB2B as number) : null;
                  return (
                    <tr key={m.id as number} className="border-b border-[#F0F0F0] hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500 tabular-nums">
                        {formatTime(m.createdAt as number)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${MOVE_TYPE_COLOR[m.type as string] ?? 'text-gray-600 bg-gray-100'}`}>
                          {MOVE_TYPE_LABEL[m.type as string] ?? m.type as string}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-800">
                        {m.productName as string} <span className="text-gray-400">· {m.color as string}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{m.rollNumber as string}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">{m.meters as number} m</td>
                      {data.isOwner && (
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500 text-xs">
                          {isExit ? formatCOP(m.priceB2B as number) : '—'}
                        </td>
                      )}
                      {data.isOwner && (
                        <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-800">
                          {valor !== null ? formatCOP(valor) : '—'}
                        </td>
                      )}
                      <td className="px-5 py-3 text-gray-600">{(m.clientName as string) ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{m.userName as string}</td>
                    </tr>
                  );
                })}
              </tbody>
              {data.isOwner && exitMovements.length > 0 && data.dayTotal !== null && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={6} className="px-5 py-3 text-right text-sm font-semibold text-gray-700">
                      Total ventas del día
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">
                      {formatCOP(data.dayTotal)}
                    </td>
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
  label, value, sub, highlight = false,
}: {
  label: string; value: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-5 ${highlight ? 'border-amber-200 bg-amber-50' : 'bg-white border-[#E5E5E5]'}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
