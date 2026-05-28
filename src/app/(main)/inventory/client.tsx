'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Roll {
  id: number;
  rollNumber: string;
  barcode: string | null;
  initialMeters: number;
  currentMeters: number;
  location: string;
  status: string;
  isRemnant: boolean;
  updatedAt: number;
  product: {
    id: number; name: string; code: string;
    color: string; width: number;
    priceOwner: number; priceB2B: number; priceB2C: number;
  };
  category: { id: number; name: string };
  lot: { id: number | null; lotNumber: string | null };
}

interface Client { id: number; name: string; type: string }
interface Product { id: number; name: string; code: string; color: string; width: number }
interface Lot { id: number; lotNumber: string }

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo', DEPLETED: 'Agotado', DEFECTIVE: 'Defectuoso', WRITTEN_OFF: 'Dado de baja',
};
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  DEPLETED: 'bg-red-100 text-red-700',
  DEFECTIVE: 'bg-orange-100 text-orange-700',
  WRITTEN_OFF: 'bg-gray-100 text-gray-600',
};

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

type ExitStep = 'product' | 'remnant-check' | 'roll' | 'confirm';

export default function InventoryClient({
  initialRolls, clients, products, lots, userRole, initialTab = 'all', openExitModal = false,
}: {
  initialRolls: Roll[];
  clients: Client[];
  products: Product[];
  lots: Lot[];
  userRole: string;
  initialTab?: 'all' | 'remnants';
  openExitModal?: boolean;
}) {
  const router = useRouter();
  const [rolls, setRolls] = useState(initialRolls);
  const [tab, setTab] = useState<'all' | 'remnants'>(initialTab);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Exit multi-step modal
  const [showExit, setShowExit] = useState(openExitModal);
  const [exitStep, setExitStep] = useState<ExitStep>('product');
  const [exitProductId, setExitProductId] = useState('');
  const [exitRoll, setExitRoll] = useState<Roll | null>(null);
  const [exitType, setExitType] = useState<'EXIT_FULL' | 'EXIT_PARTIAL'>('EXIT_PARTIAL');
  const [exitMeters, setExitMeters] = useState('');
  const [exitClient, setExitClient] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [exitLoading, setExitLoading] = useState(false);
  const [remnantWarning, setRemnantWarning] = useState<Roll[]>([]);
  const [exitPrevStep, setExitPrevStep] = useState<ExitStep>('roll');

  // Entry modal
  const [showEntry, setShowEntry] = useState(false);
  const [entryRollNumber, setEntryRollNumber] = useState('');
  const [entryProductId, setEntryProductId] = useState('');
  const [entryLotId, setEntryLotId] = useState('');
  const [entryMeters, setEntryMeters] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  const [entryBarcode, setEntryBarcode] = useState('');
  const [entryLoading, setEntryLoading] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';
  const isOwner = userRole === 'OWNER';

  // Rolls for current tab
  const tabRolls = useMemo(() => {
    if (tab === 'remnants') {
      return [...rolls]
        .filter(r => r.isRemnant && r.status === 'ACTIVE')
        .sort((a, b) => a.currentMeters - b.currentMeters);
    }
    return rolls;
  }, [rolls, tab]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tabRolls.filter(r => {
      const matchSearch = !q ||
        r.rollNumber.toLowerCase().includes(q) ||
        (r.barcode ?? '').toLowerCase().includes(q) ||
        r.product.name.toLowerCase().includes(q) ||
        r.product.code.toLowerCase().includes(q) ||
        r.product.color.toLowerCase().includes(q);
      const matchCat = !categoryFilter || r.category.name === categoryFilter;
      const matchStatus = !statusFilter
        ? true
        : statusFilter === 'REMNANT'
          ? r.isRemnant && r.status === 'ACTIVE'
          : r.status === statusFilter;
      return matchSearch && matchCat && matchStatus;
    });
  }, [tabRolls, search, categoryFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter, tab]);

  // Consecutive display numbers by category, stable across pages/filters
  // Velo → 1001+, Blackout → 1201+, ordered by category.id ASC then roll.id ASC
  const displayNumbers = useMemo(() => {
    const OFFSETS: Record<string, number> = { Velo: 1001, Blackout: 1201 };
    const DEFAULT_OFFSET = 2001;
    const sorted = [...rolls].sort((a, b) =>
      a.category.id !== b.category.id ? a.category.id - b.category.id : a.id - b.id
    );
    const counters: Record<string, number> = {};
    const map = new Map<number, number>();
    for (const r of sorted) {
      const cat = r.category.name;
      const start = OFFSETS[cat] ?? DEFAULT_OFFSET;
      if (counters[cat] === undefined) counters[cat] = 0;
      map.set(r.id, start + counters[cat]++);
    }
    return map;
  }, [rolls]);

  // Rolls for selected product (active, sorted by meters ASC for remnants first)
  const rollsForProduct = useMemo(() => {
    if (!exitProductId) return [];
    return rolls
      .filter(r => r.status === 'ACTIVE' && r.product.id === parseInt(exitProductId))
      .sort((a, b) => a.currentMeters - b.currentMeters);
  }, [rolls, exitProductId]);

  function openExitFlow(preselectedRoll?: Roll) {
    setShowExit(true);
    setExitStep(preselectedRoll ? 'confirm' : 'product');
    setExitPrevStep('roll');
    setExitProductId(preselectedRoll ? String(preselectedRoll.product.id) : '');
    setExitRoll(preselectedRoll ?? null);
    setExitType('EXIT_PARTIAL');
    setExitMeters('');
    setExitClient('');
    setExitNotes('');
    setRemnantWarning([]);
  }

  function closeExit() {
    setShowExit(false);
    setExitStep('product');
    setExitPrevStep('roll');
    setExitProductId('');
    setExitRoll(null);
    setExitMeters('');
    setExitClient('');
    setExitNotes('');
    setRemnantWarning([]);
  }

  async function handleProductNext() {
    if (!exitProductId) return;
    const remnants = rolls.filter(
      r => r.status === 'ACTIVE' && r.isRemnant && r.product.id === parseInt(exitProductId)
    );
    if (remnants.length > 0) {
      setRemnantWarning(remnants);
      setExitStep('remnant-check');
    } else {
      setExitStep('roll');
    }
  }

  async function handleExit() {
    if (!exitRoll || !exitClient) return;
    if (exitType === 'EXIT_PARTIAL' && (!exitMeters || parseFloat(exitMeters) <= 0)) {
      setToast({ message: 'Ingresa los metros a cortar', type: 'error' });
      return;
    }
    if (exitType === 'EXIT_PARTIAL' && parseFloat(exitMeters) > exitRoll.currentMeters) {
      setToast({ message: `Máximo disponible: ${exitRoll.currentMeters}m`, type: 'error' });
      return;
    }

    setExitLoading(true);
    try {
      const res = await fetch('/api/inventory/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollId: exitRoll.id,
          meters: exitType === 'EXIT_FULL' ? exitRoll.currentMeters : parseFloat(exitMeters),
          clientId: parseInt(exitClient),
          notes: exitNotes || null,
          exitType,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setToast({ message: data.error ?? 'Error al registrar salida', type: 'error' });
        return;
      }

      const usedMeters = exitType === 'EXIT_FULL' ? exitRoll.currentMeters : parseFloat(exitMeters);
      setRolls(prev => prev.map(r =>
        r.id === exitRoll.id
          ? { ...r, currentMeters: data.newMeters, status: data.newStatus, isRemnant: data.isRemnant }
          : r
      ));
      setToast({ message: `Salida registrada: ${usedMeters}m de ${exitRoll.product.name}`, type: 'success' });
      closeExit();
    } catch {
      setToast({ message: 'Error de conexión', type: 'error' });
    } finally {
      setExitLoading(false);
    }
  }

  async function handleEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!entryRollNumber || !entryProductId || !entryLotId || !entryMeters || !entryLocation) {
      setToast({ message: 'Completa todos los campos requeridos', type: 'error' });
      return;
    }

    setEntryLoading(true);
    try {
      const res = await fetch('/api/inventory/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollNumber: entryRollNumber,
          productId: parseInt(entryProductId),
          lotId: parseInt(entryLotId),
          initialMeters: parseFloat(entryMeters),
          location: entryLocation,
          barcode: entryBarcode || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setToast({ message: data.error ?? 'Error al registrar entrada', type: 'error' });
        return;
      }

      setToast({ message: 'Rollo registrado correctamente. Recargando...', type: 'success' });
      setShowEntry(false);
      setEntryRollNumber(''); setEntryProductId(''); setEntryLotId('');
      setEntryMeters(''); setEntryLocation(''); setEntryBarcode('');
      router.refresh();
    } catch {
      setToast({ message: 'Error de conexión', type: 'error' });
    } finally {
      setEntryLoading(false);
    }
  }

  const remnantCount = rolls.filter(r => r.isRemnant && r.status === 'ACTIVE').length;

  return (
    <div className="p-4 lg:p-6">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rolls.filter(r => r.status === 'ACTIVE').length} rollos activos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openExitFlow()}
            className="bg-[#0A0A0A] text-white text-sm font-medium px-4 py-2 rounded hover:bg-[#1A1A1A] transition-colors"
          >
            ↑ Nueva salida
          </button>
          {canManage && (
            <button
              onClick={() => setShowEntry(true)}
              className="bg-white border border-[#E5E5E5] text-gray-700 text-sm font-medium px-4 py-2 rounded hover:bg-gray-50 transition-colors"
            >
              + Nueva entrada
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#E5E5E5]">
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'all'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Todos los rollos
        </button>
        <button
          onClick={() => setTab('remnants')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            tab === 'remnants'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Remanentes
          {remnantCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              {remnantCount}
            </span>
          )}
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⊘</span>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por rollo, barcode, referencia, color..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E5E5] rounded text-sm focus:outline-none focus:border-gray-400"
            autoComplete="off"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        >
          <option value="">Todas las categorías</option>
          <option value="Velo">Velo</option>
          <option value="Blackout">Blackout</option>
        </select>
        {tab === 'all' && (
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activo</option>
            <option value="DEPLETED">Agotado</option>
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Rollo #</th>
                <th className="px-4 py-3 text-left">Referencia</th>
                <th className="px-4 py-3 text-left">Color</th>
                <th className="px-4 py-3 text-left">Ancho</th>
                <th className="px-4 py-3 text-left">Lote</th>
                <th className="px-4 py-3 text-left">Metros</th>
                <th className="px-4 py-3 text-left">Ubicación</th>
                <th className="px-4 py-3 text-left">Estado</th>
                {isOwner && <th className="px-4 py-3 text-right">Precio B2B</th>}
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={isOwner ? 10 : 9} className="px-4 py-12 text-center text-gray-400">
                    {tab === 'remnants' ? 'No hay remanentes activos' : 'No se encontraron rollos'}
                  </td>
                </tr>
              ) : (
                paged.map(roll => (
                  <tr key={roll.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      <div className="font-semibold text-gray-800">{displayNumbers.get(roll.id) ?? roll.id}</div>
                      <div className="text-[10px] text-gray-400">{roll.rollNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{roll.product.name}</div>
                      <div className="text-xs text-gray-400">{roll.product.code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{roll.product.color}</td>
                    <td className="px-4 py-3 text-gray-600">{roll.product.width} cm</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{roll.lot.lotNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5 flex-shrink-0">
                          <div
                            className={`h-1.5 rounded-full ${roll.isRemnant ? 'bg-amber-400' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, (roll.currentMeters / (roll.initialMeters || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs tabular-nums ${roll.isRemnant ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>
                          {roll.currentMeters}m
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">/ {roll.initialMeters}m</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{roll.location}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                        roll.isRemnant && roll.status === 'ACTIVE'
                          ? 'bg-amber-100 text-amber-700'
                          : STATUS_CLASS[roll.status] ?? 'bg-gray-100 text-gray-600'
                      }`}>
                        {roll.isRemnant && roll.status === 'ACTIVE'
                          ? 'Remanente'
                          : STATUS_LABEL[roll.status] ?? roll.status}
                      </span>
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums text-xs">
                        {formatCOP(roll.product.priceB2B)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      {roll.status === 'ACTIVE' && (
                        <button
                          onClick={() => openExitFlow(roll)}
                          className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
                        >
                          Salida
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[#E5E5E5] flex items-center justify-between text-sm">
            <span className="text-gray-500 text-xs">
              Página {page} de {totalPages} · {filtered.length} rollos
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EXIT MODAL — multi-step: bottom-sheet en móvil, modal centrado en desktop */}
      {showExit && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center sm:p-4" onClick={closeExit}>
          <div className="bg-white w-full sm:rounded-xl rounded-t-2xl shadow-2xl sm:max-w-lg max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#F0F0F0]">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Nueva salida</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {exitStep === 'product' && 'Paso 1 de 3 — Selecciona la referencia'}
                  {exitStep === 'remnant-check' && 'Aviso — Remanentes disponibles'}
                  {exitStep === 'roll' && 'Paso 2 de 3 — Selecciona el rollo'}
                  {exitStep === 'confirm' && 'Paso 3 de 3 — Tipo de salida y confirmación'}
                </p>
              </div>
              <button onClick={closeExit} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5">
              {/* STEP 1: Product */}
              {exitStep === 'product' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                      Referencia <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={exitProductId}
                      onChange={e => setExitProductId(e.target.value)}
                      autoFocus
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                    >
                      <option value="">Seleccionar referencia</option>
                      {products.map(p => {
                        const activeCount = rolls.filter(r => r.status === 'ACTIVE' && r.product.id === p.id).length;
                        return (
                          <option key={p.id} value={p.id} disabled={activeCount === 0}>
                            {p.name} — {p.color} ({activeCount} rollos activos)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeExit}
                      className="flex-1 border border-[#E5E5E5] rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleProductNext}
                      disabled={!exitProductId}
                      className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-40"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1.5: Remnant check */}
              {exitStep === 'remnant-check' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-amber-800 text-sm font-semibold mb-2">
                      ⚠ Hay {remnantWarning.length} remanente{remnantWarning.length > 1 ? 's' : ''} de esta referencia
                    </p>
                    <p className="text-amber-700 text-xs mb-3">
                      Se recomienda agotar los remanentes antes de cortar rollos completos.
                    </p>
                    <div className="space-y-1">
                      {remnantWarning.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-white border border-amber-200 rounded px-3 py-2 text-xs">
                          <span className="font-mono text-gray-600">{r.rollNumber}</span>
                          <span className="font-semibold text-amber-700">{r.currentMeters} m</span>
                          <span className="text-gray-400">{r.location}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setExitStep('product')}
                      className="flex-1 border border-[#E5E5E5] rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      ← Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const smallest = remnantWarning[0];
                        setExitRoll(smallest);
                        setExitPrevStep('remnant-check');
                        setExitStep('confirm');
                      }}
                      className="flex-1 bg-amber-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-amber-600"
                    >
                      Usar remanente
                    </button>
                    <button
                      type="button"
                      onClick={() => setExitStep('roll')}
                      className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#1A1A1A]"
                    >
                      Continuar igual
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Roll selection */}
              {exitStep === 'roll' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    {rollsForProduct.length} rollo{rollsForProduct.length !== 1 ? 's' : ''} activos disponibles
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {rollsForProduct.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setExitRoll(r); setExitPrevStep('roll'); setExitStep('confirm'); }}
                        className={`w-full flex items-center justify-between border rounded-lg px-4 py-3 text-sm hover:border-gray-400 transition-colors ${
                          exitRoll?.id === r.id ? 'border-gray-900 bg-gray-50' : 'border-[#E5E5E5]'
                        }`}
                      >
                        <div className="text-left">
                          <div className="font-mono text-xs text-gray-600 font-semibold">{r.rollNumber}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{r.location}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold text-sm ${r.isRemnant ? 'text-amber-600' : 'text-green-700'}`}>
                            {r.currentMeters} m
                          </div>
                          {r.isRemnant && <div className="text-xs text-amber-500">Remanente</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setExitStep('product')}
                      className="flex-1 border border-[#E5E5E5] rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      ← Volver
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Exit type + confirm */}
              {exitStep === 'confirm' && exitRoll && (
                <div className="space-y-4">
                  {/* Roll info */}
                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-400 block text-xs">Referencia</span><span className="font-medium">{exitRoll.product.name}</span></div>
                    <div><span className="text-gray-400 block text-xs">Color</span><span>{exitRoll.product.color}</span></div>
                    <div><span className="text-gray-400 block text-xs">Rollo #</span><span className="font-mono font-medium text-xs">{exitRoll.rollNumber}</span></div>
                    <div><span className="text-gray-400 block text-xs">Disponibles</span><span className={`font-semibold ${exitRoll.isRemnant ? 'text-amber-600' : 'text-green-700'}`}>{exitRoll.currentMeters} m</span></div>
                  </div>

                  {/* Exit type toggle */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                      Tipo de salida
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExitType('EXIT_PARTIAL')}
                        className={`flex-1 border rounded-lg px-3 py-3 text-sm text-left transition-colors ${
                          exitType === 'EXIT_PARTIAL'
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-[#E5E5E5] hover:border-gray-400'
                        }`}
                      >
                        <div className="font-semibold text-gray-900 text-xs mb-0.5">Salida parcial</div>
                        <div className="text-xs text-gray-400">Corte por metros</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExitType('EXIT_FULL')}
                        className={`flex-1 border rounded-lg px-3 py-3 text-sm text-left transition-colors ${
                          exitType === 'EXIT_FULL'
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-[#E5E5E5] hover:border-gray-400'
                        }`}
                      >
                        <div className="font-semibold text-gray-900 text-xs mb-0.5">Salida total</div>
                        <div className="text-xs text-gray-400">Vender rollo completo ({exitRoll.currentMeters}m)</div>
                      </button>
                    </div>
                  </div>

                  {/* Meters (only for partial) */}
                  {exitType === 'EXIT_PARTIAL' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                        Metros a cortar <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max={exitRoll.currentMeters}
                        value={exitMeters}
                        onChange={e => setExitMeters(e.target.value)}
                        autoFocus
                        className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                        placeholder={`Máx. ${exitRoll.currentMeters} m`}
                      />
                      {exitMeters && parseFloat(exitMeters) > 0 && parseFloat(exitMeters) <= exitRoll.currentMeters && (
                        <p className="text-xs text-gray-400 mt-1">
                          Quedarán {(exitRoll.currentMeters - parseFloat(exitMeters)).toFixed(1)} m
                          {exitRoll.currentMeters - parseFloat(exitMeters) <= 10 && exitRoll.currentMeters - parseFloat(exitMeters) > 0
                            ? ' → se marcará como remanente'
                            : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Client */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                      Cliente <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={exitClient}
                      onChange={e => setExitClient(e.target.value)}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    >
                      <option value="">Seleccionar cliente</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type === 'DISTRIBUTOR' ? 'Distribuidor' : 'Decorador'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">Notas</label>
                    <textarea
                      value={exitNotes}
                      onChange={e => setExitNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-gray-400"
                      placeholder="Observaciones opcionales..."
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setExitStep(exitPrevStep)}
                      className="border border-[#E5E5E5] rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      ← Volver
                    </button>
                    <button
                      type="button"
                      onClick={handleExit}
                      disabled={exitLoading || !exitClient || (exitType === 'EXIT_PARTIAL' && !exitMeters)}
                      className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-50"
                    >
                      {exitLoading ? 'Registrando...' : 'Confirmar salida'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ENTRY MODAL */}
      {showEntry && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowEntry(false)}>
          <div className="bg-white w-full sm:rounded-xl rounded-t-2xl shadow-2xl sm:max-w-md p-6 max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nueva entrada</h2>
              <button onClick={() => setShowEntry(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleEntry} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Número de rollo (proveedor) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={entryRollNumber}
                    onChange={e => setEntryRollNumber(e.target.value)}
                    required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="Ej. CH-250210-084"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Producto <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={entryProductId}
                    onChange={e => setEntryProductId(e.target.value)}
                    required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                  >
                    <option value="">Seleccionar producto</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.color} {p.width}cm ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Lote <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={entryLotId}
                    onChange={e => setEntryLotId(e.target.value)}
                    required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                  >
                    <option value="">Seleccionar</option>
                    {lots.map(l => (
                      <option key={l.id} value={l.id}>{l.lotNumber}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Metros iniciales <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number" step="0.1" min="1"
                    value={entryMeters}
                    onChange={e => setEntryMeters(e.target.value)}
                    required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="150"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Ubicación <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={entryLocation}
                    onChange={e => setEntryLocation(e.target.value)}
                    required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="A-01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Barcode <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={entryBarcode}
                    onChange={e => setEntryBarcode(e.target.value)}
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="DISA-VP-001-01"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEntry(false)}
                  className="flex-1 border border-[#E5E5E5] rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={entryLoading}
                  className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-50"
                >
                  {entryLoading ? 'Guardando...' : 'Registrar rollo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
