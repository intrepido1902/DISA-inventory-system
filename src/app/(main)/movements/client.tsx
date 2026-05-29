'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatColombianDate } from '@/lib/dateUtils';

interface Movement {
  id: number; type: string; meters: number; notes: string | null;
  barcodeUsed: boolean; createdAt: number; reverted: boolean;
  rollNumber: string; productName: string; productCode: string; color: string;
  priceB2B: number; saleTotal: number | null;
  userName: string; clientName: string | null; clientType: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT_FULL: 'Salida total',
  EXIT_PARTIAL: 'Salida parcial',
  ADJUSTMENT: 'Ajuste',
  WRITE_OFF: 'Baja',
  RETURN: 'Devolución',
};
const TYPE_CLASS: Record<string, string> = {
  ENTRY: 'bg-green-100 text-green-700',
  EXIT_FULL: 'bg-red-100 text-red-700',
  EXIT_PARTIAL: 'bg-orange-100 text-orange-700',
  ADJUSTMENT: 'bg-blue-100 text-blue-700',
  WRITE_OFF: 'bg-gray-100 text-gray-600',
  RETURN: 'bg-green-100 text-green-700',
};

// DISTRIBUTOR = Fijo, DECORATOR = Ocasional
const CLIENT_TYPE_LABEL: Record<string, string> = {
  DISTRIBUTOR: 'Fijo',
  DECORATOR: 'Ocasional',
};

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

function isExit(type: string) {
  return type === 'EXIT_FULL' || type === 'EXIT_PARTIAL';
}

export default function MovementsClient({
  movements,
  isOwner,
  canRevert,
}: {
  movements: Movement[];
  isOwner: boolean;
  canRevert: boolean;
}) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [revertTarget, setRevertTarget] = useState<Movement | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState('');
  const [localReverted, setLocalReverted] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    return movements.filter(m => {
      const matchType = !typeFilter || m.type === typeFilter;
      const matchDate = !dateFilter || new Date(m.createdAt).toISOString().startsWith(dateFilter);
      return matchType && matchDate;
    });
  }, [movements, typeFilter, dateFilter]);

  const dayTotal = useMemo(() => {
    if (!isOwner) return null;
    return filtered
      .filter(m => isExit(m.type) && !m.reverted && !localReverted.has(m.id))
      .reduce((sum, m) => sum + (m.saleTotal ?? m.meters * m.priceB2B), 0);
  }, [filtered, isOwner, localReverted]);

  const exitCount = filtered.filter(m => isExit(m.type) && !m.reverted && !localReverted.has(m.id)).length;
  const colSpan = isOwner ? (canRevert ? 11 : 10) : (canRevert ? 9 : 8);

  async function handleRevert() {
    if (!revertTarget) return;
    setReverting(true); setRevertError('');
    try {
      const res = await fetch(`/api/movements/${revertTarget.id}/revert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setRevertError(data.error ?? 'Error al revertir'); return; }
      setLocalReverted(prev => new Set([...prev, revertTarget.id]));
      setRevertTarget(null);
      router.refresh();
    } catch {
      setRevertError('Error de conexión');
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Movimientos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Últimos {movements.length} registros</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Todos los tipos</option>
          <option value="ENTRY">Entradas</option>
          <option value="EXIT_FULL">Salidas totales</option>
          <option value="EXIT_PARTIAL">Salidas parciales</option>
          <option value="RETURN">Devoluciones</option>
          <option value="ADJUSTMENT">Ajustes</option>
          <option value="WRITE_OFF">Bajas</option>
        </select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
        {(typeFilter || dateFilter) && (
          <button onClick={() => { setTypeFilter(''); setDateFilter(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">
            Limpiar filtros
          </button>
        )}
        <span className="text-sm text-gray-400 self-center ml-auto">{filtered.length} registros</span>
      </div>

      {isOwner && dayTotal !== null && exitCount > 0 && (
        <div className="mb-4 bg-white border border-[#E5E5E5] rounded-lg px-5 py-3 flex items-center justify-between">
          <p className="text-sm text-gray-500">{exitCount} salida{exitCount !== 1 ? 's' : ''} en esta vista</p>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total ventas</p>
            <p className="text-lg font-bold text-gray-900">{formatCOP(dayTotal)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Rollo</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-right">Metros</th>
                {isOwner && <th className="px-4 py-3 text-right">Total venta</th>}
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Notas</th>
                {canRevert && <th className="px-4 py-3 text-center">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-gray-400">No hay movimientos</td>
                </tr>
              ) : (
                filtered.map(m => {
                  const isReverted = m.reverted || localReverted.has(m.id);
                  const exit = isExit(m.type);
                  const valor = exit ? (m.saleTotal ?? null) : null;
                  return (
                    <tr key={m.id} className={`border-b border-[#F5F5F5] hover:bg-gray-50 ${isReverted ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                        {formatColombianDate(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_CLASS[m.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABEL[m.type] ?? m.type}
                        </span>
                        {isReverted && <span className="ml-1 text-xs text-gray-400">(rev.)</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.rollNumber}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{m.productName}</div>
                        <div className="text-xs text-gray-400">{m.color}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800">{m.meters} m</td>
                      {isOwner && (
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800">
                          {valor !== null ? formatCOP(valor) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600 text-xs">{m.userName}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {m.clientName ? (
                          <div>
                            {m.clientName}
                            <span className="text-gray-400 ml-1">({CLIENT_TYPE_LABEL[m.clientType ?? ''] ?? m.clientType})</span>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-32 truncate">{m.notes ?? '—'}</td>
                      {canRevert && (
                        <td className="px-4 py-3 text-center">
                          {exit && !isReverted ? (
                            <button onClick={() => { setRevertTarget(m); setRevertError(''); }}
                              className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 rounded px-2 py-1 transition-colors">
                              Revertir
                            </button>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {isOwner && exitCount > 0 && dayTotal !== null && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    Total ventas ({exitCount} salidas)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{formatCOP(dayTotal)}</td>
                  <td colSpan={canRevert ? 4 : 3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Revert confirmation modal */}
      {revertTarget && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={() => setRevertTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">¿Revertir esta salida?</h2>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div><span className="text-gray-400">Rollo: </span><span className="font-mono">{revertTarget.rollNumber}</span></div>
              <div><span className="text-gray-400">Metros: </span><span className="font-semibold">{revertTarget.meters} m</span></div>
              <div><span className="text-gray-400">Cliente: </span>{revertTarget.clientName ?? '—'}</div>
              <div><span className="text-gray-400">Fecha: </span>{formatColombianDate(revertTarget.createdAt)}</div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Se restaurarán los metros al rollo y se creará un movimiento de tipo "Devolución".
            </p>
            {revertError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">{revertError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setRevertTarget(null)}
                className="flex-1 border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleRevert} disabled={reverting}
                className="flex-1 bg-red-600 text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {reverting ? 'Revirtiendo...' : 'Confirmar reversión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
