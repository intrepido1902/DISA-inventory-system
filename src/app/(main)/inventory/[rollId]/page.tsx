import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';

const OFFSETS: Record<string, number> = { Velo: 1001, Blackout: 1201 };
const DEFAULT_OFFSET = 2001;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', DEPLETED: 'Agotado',
  DEFECTIVE: 'Defectuoso', WRITTEN_OFF: 'Dado de baja',
};
const MOVEMENT_LABEL: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT_FULL: 'Salida total',
  EXIT_PARTIAL: 'Salida parcial',
  ADJUSTMENT: 'Ajuste',
};
const MOVEMENT_ICON: Record<string, string> = {
  ENTRY: '↓', EXIT_FULL: '↑', EXIT_PARTIAL: '↗', ADJUSTMENT: '⟳',
};
const MOVEMENT_COLOR: Record<string, string> = {
  ENTRY: 'bg-green-100 text-green-700 border-green-200',
  EXIT_FULL: 'bg-red-100 text-red-700 border-red-200',
  EXIT_PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
  ADJUSTMENT: 'bg-blue-100 text-blue-700 border-blue-200',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function RollTracePage({
  params,
}: {
  params: Promise<{ rollId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { rollId } = await params;
  const rollIdNum = Number(rollId);
  if (isNaN(rollIdNum)) notFound();

  const dbAny = db as any;

  // Fetch roll with product, category, lot
  const rollRes = await dbAny.from('Roll').select(`
    id, rollNumber, barcode, label_number, initialMeters, currentMeters,
    location, status, isRemnant, createdAt,
    product:productId(id, name, code, color, width,
      category:categoryId(id, name)
    ),
    lot:lotId(id, lotNumber, importDate)
  `).eq('id', rollIdNum).single();

  if (rollRes.error || !rollRes.data) notFound();

  const r = rollRes.data as any;
  const categoryName: string = r.product?.category?.name ?? '';
  const categoryId: number = r.product?.category?.id ?? 0;

  const displayColor = isBlackoutProduct(categoryName)
    ? getBlackoutColorName(r.product?.code ?? '', r.product?.color ?? '')
    : (r.product?.color ?? '—');

  // Compute consecutivo
  let consecutivo: number | null = null;
  if (categoryId) {
    const prodsRes = await dbAny.from('Product').select('id').eq('categoryId', categoryId);
    const prodIds: number[] = (prodsRes.data ?? []).map((p: any) => p.id as number);
    if (prodIds.length > 0) {
      const { count } = await dbAny.from('Roll')
        .select('id', { count: 'exact', head: true })
        .in('productId', prodIds)
        .lt('id', rollIdNum);
      consecutivo = (OFFSETS[categoryName] ?? DEFAULT_OFFSET) + (count ?? 0);
    }
  }

  // Fetch movements in chronological order
  const movRes = await dbAny.from('Movement').select(`
    id, type, meters, notes, createdAt,
    user:userId(name),
    sale:saleId(client:clientId(name))
  `).eq('rollId', rollIdNum).order('createdAt', { ascending: true });

  const rawMovements: any[] = movRes.data ?? [];

  // Compute running meters
  let runningMeters = 0;
  const movements = rawMovements.map((m: any) => {
    if (m.type === 'ENTRY') {
      runningMeters = m.meters as number;
    } else {
      runningMeters = Math.max(0, runningMeters - (m.meters as number));
    }
    return {
      id: m.id as number,
      createdAt: m.createdAt as number,
      type: m.type as string,
      meters: m.meters as number,
      metersAfter: runningMeters,
      notes: m.notes as string | null,
      userName: m.user?.name ?? '—',
      clientName: m.sale?.client?.name ?? null,
    };
  });

  const titleConseq = consecutivo ? `#${consecutivo}` : `ID ${rollIdNum}`;
  const titleRef = r.product?.code ? `(${r.product.code})` : '';

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      {/* Back + title */}
      <div className="mb-6">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          ← Volver al inventario
        </Link>
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
          Trazabilidad — Rollo {titleConseq} {titleRef}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {r.product?.name ?? '—'} · {displayColor}
        </p>
      </div>

      {/* Roll info card */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Ficha del rollo
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Consecutivo', value: consecutivo ? String(consecutivo) : '—' },
            { label: 'N° Etiqueta', value: r.label_number != null ? String(r.label_number) : '—' },
            { label: 'Referencia', value: r.product?.code ?? '—' },
            { label: 'Producto', value: r.product?.name ?? '—' },
            { label: 'Color', value: displayColor },
            { label: 'Categoría', value: categoryName || '—' },
            { label: 'Ancho', value: r.product?.width ? `${r.product.width} cm` : '—' },
            { label: 'Ubicación', value: r.location ?? '—' },
            { label: 'Metros iniciales', value: `${r.initialMeters} m` },
            { label: 'Metros actuales', value: `${r.currentMeters} m` },
            { label: 'Estado', value: STATUS_LABEL[r.status] ?? r.status },
            { label: 'Lote', value: r.lot?.lotNumber ?? '—' },
            { label: 'Rollo proveedor', value: r.rollNumber ?? '—' },
            { label: 'Barcode', value: r.barcode ?? '—' },
            { label: 'Ingresado', value: r.createdAt ? formatDate(r.createdAt as number) : '—' },
            {
              label: 'Remanente',
              value: Boolean(r.isRemnant) && r.status === 'ACTIVE' ? 'Sí' : 'No',
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-sm font-medium text-gray-900 break-words">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-5">
          Línea de tiempo — {movements.length} movimiento{movements.length !== 1 ? 's' : ''}
        </h2>

        {movements.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Este rollo no tiene movimientos registrados aún.
          </p>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-[#E5E5E5]" />

            <div className="space-y-6">
              {movements.map((m, i) => (
                <div key={m.id} className="relative flex gap-4">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0 z-10 text-sm font-bold ${
                      MOVEMENT_COLOR[m.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {MOVEMENT_ICON[m.type] ?? '·'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">
                          {MOVEMENT_LABEL[m.type] ?? m.type}
                        </span>
                        {m.clientName && (
                          <span className="text-sm text-gray-500"> · {m.clientName}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {formatDate(m.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-1.5">
                      {m.type === 'ENTRY' ? (
                        <span>
                          <span className="text-gray-400">Metros registrados: </span>
                          <span className="font-semibold text-green-700">{m.meters} m</span>
                        </span>
                      ) : (
                        <span>
                          <span className="text-gray-400">Metros descontados: </span>
                          <span className="font-semibold text-red-700">{m.meters} m</span>
                        </span>
                      )}
                      <span>
                        <span className="text-gray-400">Metros restantes: </span>
                        <span className={`font-semibold ${m.metersAfter <= 10 && m.metersAfter > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                          {m.metersAfter} m
                          {m.metersAfter === 0 && i === movements.length - 1 ? ' (agotado)' : ''}
                        </span>
                      </span>
                      <span>
                        <span className="text-gray-400">Registrado por: </span>
                        <span className="font-medium text-gray-700">{m.userName}</span>
                      </span>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-gray-400 italic bg-gray-50 rounded px-2 py-1">
                        {m.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
