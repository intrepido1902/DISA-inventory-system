'use client';

import { useState, useEffect, useRef } from 'react';
import { formatColombianDate } from '@/lib/dateUtils';

interface Sale {
  id: number;
  clientId: number;
  clientName: string;
  date: string;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: number;
  rollCount: number;
  totalMeters: number;
}

interface Client { id: number; name: string }

interface Props {
  initialSales: Sale[];
  initialTotal: number;
  initialTotalPages: number;
  clients: Client[];
  initialClientId: string;
  initialDateFrom: string;
  initialDateTo: string;
  isOwner: boolean;
}

const LIMIT = 50;

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n);
}

export default function SalesClient({
  initialSales,
  initialTotal,
  initialTotalPages,
  clients,
  initialClientId,
  initialDateFrom,
  initialDateTo,
  isOwner,
}: Props) {
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [clientId, setClientId] = useState(initialClientId);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [isFetching, setIsFetching] = useState(false);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      if (page === 1 && !clientId && !dateFrom && !dateTo) return;
    }

    const ctrl = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (clientId)  params.set('clientId',  clientId);
    if (dateFrom)  params.set('dateFrom',  dateFrom);
    if (dateTo)    params.set('dateTo',    dateTo);

    setIsFetching(true);
    fetch(`/api/sales?${params}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setSales(json.data);
          setTotal(json.total ?? 0);
          setTotalPages(json.totalPages ?? 1);
        }
      })
      .catch(e => { if (e.name !== 'AbortError') console.error('sales fetch error:', e); })
      .finally(() => setIsFetching(false));

    return () => ctrl.abort();
  }, [page, clientId, dateFrom, dateTo]);

  function handleClientChange(val: string) {
    setClientId(val);
    setPage(1);
  }
  function handleDateFromChange(val: string) {
    setDateFrom(val);
    setPage(1);
  }
  function handleDateToChange(val: string) {
    setDateTo(val);
    setPage(1);
  }
  function clearFilters() {
    setClientId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const hasFilters = Boolean(clientId || dateFrom || dateTo);

  // Aggregates for current page
  const pageTotal = sales.reduce((sum, s) => sum + s.total, 0);
  const pageMeters = sales.reduce((sum, s) => sum + s.totalMeters, 0);

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Historial de ventas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isFetching ? 'Cargando…' : `${total} venta${total !== 1 ? 's' : ''} en total`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {/* Client filter */}
        <select
          value={clientId}
          onChange={e => handleClientChange(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        >
          <option value="">Todos los clientes</option>
          {clients.map(c => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>

        {/* Date from */}
        <input
          type="date"
          value={dateFrom}
          onChange={e => handleDateFromChange(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        />

        {/* Date to */}
        <input
          type="date"
          value={dateTo}
          onChange={e => handleDateToChange(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-900 border border-[#E5E5E5] rounded px-3 py-2 hover:bg-gray-50 transition-colors"
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Summary row for current page */}
      {sales.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-4 text-sm text-gray-500">
          {isOwner && (
            <span>
              Total página:{' '}
              <span className="font-semibold text-gray-900">{formatCOP(pageTotal)}</span>
            </span>
          )}
          <span>
            Metros en página:{' '}
            <span className="font-semibold text-gray-900">
              {Number(pageMeters).toLocaleString('es-CO', { maximumFractionDigits: 1 })} m
            </span>
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        {isFetching && (
          <div className="px-5 py-3 text-xs text-gray-400 border-b border-[#F0F0F0]">Actualizando…</div>
        )}
        {!isFetching && sales.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {hasFilters ? 'No hay ventas con estos filtros.' : 'No hay ventas registradas.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Fecha y hora</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-right">Rollos</th>
                  <th className="px-4 py-3 text-right">Metros</th>
                  {isOwner && <th className="px-4 py-3 text-right">Subtotal</th>}
                  {isOwner && <th className="px-4 py-3 text-right">Desc.</th>}
                  {isOwner && <th className="px-4 py-3 text-right">Total</th>}
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="border-b border-[#F0F0F0] hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                      {formatColombianDate(s.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-800 text-xs">{s.clientName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-600">
                      {s.rollCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-medium text-gray-800">
                      {Number(s.totalMeters).toLocaleString('es-CO', { maximumFractionDigits: 1 })} m
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-600">
                        {formatCOP(s.subtotal)}
                      </td>
                    )}
                    {isOwner && (
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-500">
                        {s.discount > 0 ? `${s.discount}%` : '—'}
                      </td>
                    )}
                    {isOwner && (
                      <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-gray-900">
                        {formatCOP(s.total)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Página {page} de {totalPages} · {total} resultado{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetching}
              className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
