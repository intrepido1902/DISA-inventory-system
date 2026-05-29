import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', DEPLETED: 'Agotado',
  DEFECTIVE: 'Defectuoso', WRITTEN_OFF: 'Dado de baja',
};

const MOVEMENT_LABEL: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT_FULL: 'Salida completa',
  EXIT_PARTIAL: 'Corte parcial',
  ADJUSTMENT: 'Ajuste',
  WRITE_OFF: 'Baja',
};

const MOVEMENT_EMOJI: Record<string, string> = {
  ENTRY: '📦',
  EXIT_FULL: '📤',
  EXIT_PARTIAL: '✂️',
  ADJUSTMENT: '🔧',
  WRITE_OFF: '🗑️',
};

const MOVEMENT_COLOR: Record<string, string> = {
  ENTRY: 'bg-green-100 text-green-700 border-green-200',
  EXIT_FULL: 'bg-red-100 text-red-700 border-red-200',
  EXIT_PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
  ADJUSTMENT: 'bg-blue-100 text-blue-700 border-blue-200',
  WRITE_OFF: 'bg-gray-100 text-gray-600 border-gray-200',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  });
}

function displayRollNumber(rollNumber: string): string {
  const n = parseInt(rollNumber, 10);
  return isNaN(n) ? rollNumber : String(n);
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

  const rollRes = await dbAny.from('Roll').select(`
    id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
    location, status, isRemnant, createdAt,
    product:productId(id, name, code, color, width,
      category:categoryId(id, name)
    ),
    lot:lotId(id, lotNumber, importDate, supplier)
  `).eq('id', rollIdNum).single();

  if (rollRes.error || !rollRes.data) notFound();

  const r = rollRes.data as any;
  const categoryName: string = r.product?.category?.name ?? '';

  const displayColor = isBlackoutProduct(categoryName)
    ? getBlackoutColorName(r.product?.color ?? '')
    : (r.product?.color ?? '—');

  // Fetch movements chronological
  const movRes = await dbAny.from('Movement').select(`
    id, type, meters, notes, createdAt,
    user:userId(name),
    sale:saleId(client:clientId(name))
  `).eq('rollId', rollIdNum).order('createdAt', { ascending: true });

  const rawMovements: any[] = movRes.data ?? [];

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

  const rollDisplay = r.disaNumber ?? `ID ${rollIdNum}`;
  const refDisplay = r.product?.code ?? '';

  return (
    <div className="p-4 lg:p-6 max-w-5xl">
      {/* Back + title */}
      <div className="mb-6">
        <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4">
          ← Volver al inventario
        </Link>
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">
          Rollo {rollDisplay} {refDisplay && <span className="text-gray-400">— {refDisplay}</span>}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {r.product?.name ?? '—'} · {displayColor}
        </p>
      </div>

      {/* Roll info card — 2 cols desktop, 1 col mobile */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5 mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Ficha del rollo</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          {[
            { label: 'N° DISA (rojo)', value: r.disaNumber ?? '—' },
            { label: 'No. Rollo proveedor', value: displayRollNumber(r.rollNumber) },
            { label: 'Referencia', value: r.product?.code ?? '—' },
            { label: 'Producto', value: r.product?.name ?? '—' },
            { label: 'Color', value: displayColor },
            { label: 'Categoría', value: categoryName || '—' },
            { label: 'Ancho', value: r.product?.width ? `${r.product.width} cm` : '—' },
            { label: 'Ubicación', value: r.location ?? '—' },
            { label: 'Metros iniciales', value: `${r.initialMeters} m` },
            { label: 'Metros actuales', value: `${r.currentMeters} m` },
            { label: 'Estado', value: STATUS_LABEL[r.status] ?? r.status },
            { label: 'Remanente', value: Boolean(r.isRemnant) && r.status === 'ACTIVE' ? 'Sí' : 'No' },
            { label: 'Lote', value: r.lot?.lotNumber ?? '—' },
            { label: 'Proveedor', value: r.lot?.supplier ?? '—' },
            { label: 'Barcode', value: r.barcode ?? '—' },
            { label: 'Ingresado', value: r.createdAt ? formatDate(r.createdAt as number) : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-sm font-medium text-gray-900 break-words">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-5">
          Línea de tiempo — {movements.length} movimiento{movements.length !== 1 ? 's' : ''}
        </h2>

        {movements.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Sin movimientos registrados</p>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-[#E5E5E5]" />
            <div className="space-y-6">
              {movements.map((m, i) => (
                <div key={m.id} className="relative flex gap-4">
                  {/* Emoji icon */}
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0 z-10 text-base ${MOVEMENT_COLOR[m.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {MOVEMENT_EMOJI[m.type] ?? '·'}
                  </div>

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
                      <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                        {formatDate(m.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-1.5">
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
                        <span className="text-gray-400">Restantes: </span>
                        <span className={`font-semibold ${m.metersAfter <= 10 && m.metersAfter > 0 ? 'text-amber-600' : m.metersAfter === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {m.metersAfter} m
                          {m.metersAfter === 0 && i === movements.length - 1 ? ' (agotado)' : ''}
                          {m.metersAfter > 0 && m.metersAfter <= 10 ? ' (remanente)' : ''}
                        </span>
                      </span>
                      <span>
                        <span className="text-gray-400">Registrado por: </span>
                        <span className="font-medium text-gray-700">{m.userName}</span>
                      </span>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-gray-400 italic bg-gray-50 border border-[#F0F0F0] rounded px-2 py-1">
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
