'use client';

import { useState, useMemo } from 'react';

interface Movement {
  id: number; type: string; meters: number; notes: string | null;
  barcodeUsed: boolean; createdAt: number;
  rollNumber: string; productName: string; productCode: string; color: string;
  priceB2B: number;
  userName: string; clientName: string | null; clientType: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT_FULL: 'Salida total',
  EXIT_PARTIAL: 'Salida parcial',
  ADJUSTMENT: 'Ajuste',
  WRITE_OFF: 'Baja',
};
const TYPE_CLASS: Record<string, string> = {
  ENTRY: 'bg-green-100 text-green-700',
  EXIT_FULL: 'bg-red-100 text-red-700',
  EXIT_PARTIAL: 'bg-orange-100 text-orange-700',
  ADJUSTMENT: 'bg-blue-100 text-blue-700',
  WRITE_OFF: 'bg-gray-100 text-gray-600',
};

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

function isExit(type: string) {
  return type === 'EXIT_FULL' || type === 'EXIT_PARTIAL';
}

export default function MovementsClient({ movements, isOwner }: { movements: Movement[]; isOwner: boolean }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

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
      .filter(m => isExit(m.type))
      .reduce((sum, m) => sum + m.meters * m.priceB2B, 0);
  }, [filtered, isOwner]);

  const exitCount = filtered.filter(m => isExit(m.type)).length;
  const colSpan = isOwner ? 10 : 8;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Movimientos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Últimos {movements.length} registros</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        >
          <option value="">Todos los tipos</option>
          <option value="ENTRY">Entradas</option>
          <option value="EXIT_FULL">Salidas totales</option>
          <option value="EXIT_PARTIAL">Salidas parciales</option>
          <option value="ADJUSTMENT">Ajustes</option>
          <option value="WRITE_OFF">Bajas</option>
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        />
        {(typeFilter || dateFilter) && (
          <button
            onClick={() => { setTypeFilter(''); setDateFilter(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-sm text-gray-400 self-center ml-auto">{filtered.length} registros</span>
      </div>

      {/* Day total for OWNER */}
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
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Rollo</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-right">Metros</th>
                {isOwner && <th className="px-4 py-3 text-right">Precio/m</th>}
                {isOwner && <th className="px-4 py-3 text-right">Valor</th>}
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-gray-400">
                    No hay movimientos
                  </td>
                </tr>
              ) : (
                filtered.map(m => {
                  const exit = isExit(m.type);
                  const valor = exit ? m.meters * m.priceB2B : null;
                  return (
                    <tr key={m.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_CLASS[m.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABEL[m.type] ?? m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.rollNumber}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{m.productName}</div>
                        <div className="text-xs text-gray-400">{m.color}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800">
                        {m.meters} m
                      </td>
                      {isOwner && (
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500 text-xs">
                          {exit ? formatCOP(m.priceB2B) : '—'}
                        </td>
                      )}
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
                            <span className="text-gray-400 ml-1">
                              ({m.clientType === 'DISTRIBUTOR' ? 'Dist.' : 'Dec.'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-32 truncate">
                        {m.notes ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {isOwner && exitCount > 0 && dayTotal !== null && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={6} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                    Total ventas ({exitCount} salidas)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">
                    {formatCOP(dayTotal)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
