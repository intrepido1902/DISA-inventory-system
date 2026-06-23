'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatColombianDate } from '@/lib/dateUtils';

interface Client {
  id: number; name: string; type: string; phone: string | null;
  email: string | null; notes: string | null; active: number;
  createdAt: number; pricePerMeter: number | null;
  sellsByRoll: boolean;
}

interface ClientPrice {
  id: number; productRef: string; pricePerMeter: number;
}

interface OccasionalStat {
  clientId: number;
  lastPurchaseDate: number | null;
  totalMeters: number;
  lastPricePerMeter: number | null;
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fixed' | 'occasional'>('fixed');

  // Price modal state
  const [priceModal, setPriceModal] = useState<{ client: Client; prices: ClientPrice[] } | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState('');

  // Occasional stats
  const [stats, setStats] = useState<OccasionalStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  // Determine user role from session (passed via a hidden attribute trick isn't viable here —
  // instead we fetch a minimal endpoint that returns the role, or just check if PUT succeeds)
  // For now we always show the "Edit" button and handle 403 gracefully.

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then((raw: unknown) => {
        const data = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
        setClients(data as Client[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'occasional' || stats.length > 0) return;
    setLoadingStats(true);
    fetch('/api/clients/sales-stats')
      .then(r => r.json())
      .then((data: unknown) => {
        setStats(Array.isArray(data) ? (data as OccasionalStat[]) : []);
      })
      .catch(console.error)
      .finally(() => setLoadingStats(false));
  }, [tab, stats.length]);

  const fixedClients = useMemo(() =>
    clients
      .filter(c => c.type === 'FIXED' || c.type === 'DISTRIBUTOR' || c.type === 'GENERAL')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clients]);

  const occasionalClients = useMemo(() =>
    clients
      .filter(c => c.type === 'OCCASIONAL' || c.type === 'DECORATOR')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clients]);

  const statsMap = useMemo(() => {
    const m = new Map<number, OccasionalStat>();
    stats.forEach(s => m.set(s.clientId, s));
    return m;
  }, [stats]);

  const displayed = tab === 'fixed' ? fixedClients : occasionalClients;

  async function openPriceModal(client: Client) {
    setLoadingPrices(true);
    setPriceModal({ client, prices: [] });
    setEditingRef(null); setPriceError('');
    try {
      const res = await fetch(`/api/clients/${client.id}/prices`);
      const data = await res.json();
      setPriceModal({ client, prices: Array.isArray(data) ? data : [] });
    } catch {
      setPriceModal({ client, prices: [] });
    } finally {
      setLoadingPrices(false);
    }
  }

  async function handleSavePrice(clientId: number, productRef: string) {
    const price = parseFloat(editValue);
    if (isNaN(price) || price <= 0) { setPriceError('Ingresa un precio válido'); return; }
    setSavingPrice(true); setPriceError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productRef, pricePerMeter: price }),
      });
      const data = await res.json();
      if (!res.ok) { setPriceError(data.error ?? 'Error al guardar'); return; }
      // Update local prices
      setPriceModal(prev => prev ? {
        ...prev,
        prices: prev.prices.map(p => p.productRef === productRef ? { ...p, pricePerMeter: price } : p),
      } : null);
      setEditingRef(null);
    } catch {
      setPriceError('Error de conexión');
    } finally {
      setSavingPrice(false);
    }
  }

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
            {tab === 'fixed' ? (
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                    <th className="px-5 py-3 text-left">Nombre</th>
                    <th className="px-5 py-3 text-left">Vende por</th>
                    <th className="px-5 py-3 text-left">Teléfono</th>
                    <th className="px-5 py-3 text-left">Desde</th>
                    <th className="px-5 py-3 text-center">Precios</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                        No hay clientes fijos registrados
                      </td>
                    </tr>
                  ) : (
                    displayed.map(c => (
                      <tr key={c.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-5 py-3 text-gray-600 text-xs">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.sellsByRoll ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {c.sellsByRoll ? 'Rollo' : 'Metro/Corte'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-600 tabular-nums">{c.phone ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs tabular-nums">
                          {c.createdAt ? formatColombianDate(c.createdAt, false) : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button onClick={() => openPriceModal(c)}
                            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 rounded px-2.5 py-1 transition-colors">
                            Ver precios
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm min-w-[580px]">
                <thead>
                  <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                    <th className="px-5 py-3 text-left">Nombre</th>
                    <th className="px-5 py-3 text-left">Teléfono</th>
                    <th className="px-5 py-3 text-right">Metros totales</th>
                    <th className="px-5 py-3 text-right">Precio últ. venta</th>
                    <th className="px-5 py-3 text-left">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                        No hay clientes ocasionales registrados
                      </td>
                    </tr>
                  ) : (
                    displayed.map(c => {
                      const s = statsMap.get(c.id);
                      return (
                        <tr key={c.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                          <td className="px-5 py-3 text-gray-600 tabular-nums">{c.phone ?? '—'}</td>
                          <td className="px-5 py-3 text-right text-gray-600 tabular-nums">
                            {s?.totalMeters ? `${s.totalMeters} m` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                            {s?.lastPricePerMeter ? formatCOP(s.lastPricePerMeter) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-gray-400 text-xs tabular-nums">
                            {loadingStats
                              ? <span className="text-gray-300">...</span>
                              : s?.lastPurchaseDate
                                ? formatColombianDate(s.lastPurchaseDate, false)
                                : <span className="text-gray-300">Sin compras</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Price Modal ── */}
      {priceModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={() => { setPriceModal(null); setEditingRef(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#F0F0F0]">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Precios — {priceModal.client.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Precio por metro por referencia</p>
              </div>
              <button onClick={() => { setPriceModal(null); setEditingRef(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-4">
              {loadingPrices ? (
                <div className="py-8 text-center text-gray-400 text-sm">Cargando...</div>
              ) : priceModal.prices.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No hay precios configurados</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-[#F0F0F0]">
                      <th className="pb-2 text-left">Referencia</th>
                      <th className="pb-2 text-right">Precio/m</th>
                      <th className="pb-2 text-right w-20">Editar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceModal.prices.map(p => (
                      <tr key={p.productRef} className="border-b border-[#F5F5F5]">
                        <td className="py-2.5 font-mono font-semibold text-gray-800">{p.productRef}</td>
                        <td className="py-2.5 text-right tabular-nums text-gray-700">
                          {editingRef === p.productRef ? (
                            <input type="number" step="100" min="1" value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="w-28 text-right border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-gray-500"
                              autoFocus />
                          ) : (
                            formatCOP(p.pricePerMeter)
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          {editingRef === p.productRef ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => setEditingRef(null)} className="text-xs text-gray-500 border border-[#E5E5E5] rounded px-2 py-1 hover:bg-gray-50">✕</button>
                              <button onClick={() => handleSavePrice(priceModal.client.id, p.productRef)} disabled={savingPrice}
                                className="text-xs bg-[#0A0A0A] text-white rounded px-2 py-1 hover:bg-[#1A1A1A] disabled:opacity-40">
                                {savingPrice ? '...' : '✓'}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingRef(p.productRef); setEditValue(String(p.pricePerMeter)); setPriceError(''); }}
                              className="text-xs text-gray-500 hover:text-gray-900 border border-[#E5E5E5] rounded px-2 py-1 hover:bg-gray-50 transition-colors">
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {priceError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2 mt-3">{priceError}</p>
              )}
            </div>

            <div className="px-6 pb-5">
              <button onClick={() => { setPriceModal(null); setEditingRef(null); }}
                className="w-full border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
