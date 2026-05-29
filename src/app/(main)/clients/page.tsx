'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatColombianDate } from '@/lib/dateUtils';

interface Client {
  id: number; name: string; type: string; phone: string | null;
  email: string | null; notes: string | null; active: number;
  createdAt: number; pricePerMeter: number | null;
  lastPrice?: number | null;
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fixed' | 'occasional'>('fixed');

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then((data: unknown) => {
        // Guard: API may return an error object instead of an array
        const safeClients = Array.isArray(data) ? (data as Client[]) : [];
        setClients(safeClients);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fixedClients = useMemo(() =>
    clients
      .filter(c => c.type === 'FIXED' || c.type === 'DISTRIBUTOR')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clients]);

  const occasionalClients = useMemo(() =>
    clients
      .filter(c => c.type === 'OCCASIONAL' || c.type === 'DECORATOR')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clients]);

  const displayed = tab === 'fixed' ? fixedClients : occasionalClients;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {fixedClients.length} fijos · {occasionalClients.length} ocasionales
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#E5E5E5]">
        {([
          { key: 'fixed', label: 'Clientes Fijos', count: fixedClients.length },
          { key: 'occasional', label: 'Clientes Ocasionales', count: occasionalClients.length },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="px-5 py-3 text-left">Nombre</th>
                  {tab === 'fixed'
                    ? <th className="px-5 py-3 text-right">Precio por metro</th>
                    : <th className="px-5 py-3 text-left">Último precio</th>
                  }
                  <th className="px-5 py-3 text-left">Teléfono</th>
                  <th className="px-5 py-3 text-left">Desde</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                      No hay clientes {tab === 'fixed' ? 'fijos' : 'ocasionales'} registrados
                    </td>
                  </tr>
                ) : (
                  displayed.map(c => (
                    <tr key={c.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                      {tab === 'fixed' ? (
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                          {c.pricePerMeter ? formatCOP(c.pricePerMeter) : <span className="text-gray-300">—</span>}
                        </td>
                      ) : (
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {c.lastPrice ? formatCOP(c.lastPrice) : <span className="text-gray-300">—</span>}
                        </td>
                      )}
                      <td className="px-5 py-3 text-gray-600 tabular-nums">{c.phone ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs tabular-nums">
                        {c.createdAt ? formatColombianDate(c.createdAt, false) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
