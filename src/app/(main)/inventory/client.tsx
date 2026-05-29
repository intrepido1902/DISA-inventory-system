'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientCombobox, { type ComboClient } from '@/components/ClientCombobox';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';

interface Roll {
  id: number;
  rollNumber: string;
  barcode: string | null;
  disaNumber: string | null;
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

interface Product { id: number; name: string; code: string; color: string; width: number }
interface Lot { id: number; lotNumber: string }

const PAGE_SIZE = 25;

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

function displayRollNumber(rollNumber: string): string {
  const n = parseInt(rollNumber, 10);
  return isNaN(n) ? rollNumber : String(n);
}

function rollDisplayColor(roll: Roll): string {
  if (isBlackoutProduct(roll.category.name)) {
    return getBlackoutColorName(roll.product.color);
  }
  return roll.product.color;
}

function updateUrl(filters: Record<string, string>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  ['q', 'cat', 'status', 'color', 'minM', 'maxM', 'loc'].forEach(k => url.searchParams.delete(k));
  Object.entries(filters).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  window.history.replaceState({}, '', url.toString());
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
  initialRolls, clients: initialClients, products, lots, userRole,
  initialTab = 'all', openExitModal = false,
  initialSearch = '', initialCategory = '', initialStatus = '',
  initialColor = '', initialMinMeters = '', initialMaxMeters = '', initialLocation = '',
}: {
  initialRolls: Roll[];
  clients: ComboClient[];
  products: Product[];
  lots: Lot[];
  userRole: string;
  initialTab?: 'all' | 'remnants';
  openExitModal?: boolean;
  initialSearch?: string;
  initialCategory?: string;
  initialStatus?: string;
  initialColor?: string;
  initialMinMeters?: string;
  initialMaxMeters?: string;
  initialLocation?: string;
}) {
  const router = useRouter();

  const [rolls, setRolls] = useState(initialRolls);
  const [clientsList, setClientsList] = useState<ComboClient[]>(initialClients);
  const [tab, setTab] = useState<'all' | 'remnants'>(initialTab);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [colorFilter, setColorFilter] = useState(initialColor);
  const [minMeters, setMinMeters] = useState(initialMinMeters);
  const [maxMeters, setMaxMeters] = useState(initialMaxMeters);
  const [locationFilter, setLocationFilter] = useState(initialLocation);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [page, setPage] = useState(1);

  // Exit modal
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
  const [entryDisaNumber, setEntryDisaNumber] = useState('');
  const [entryProductId, setEntryProductId] = useState('');
  const [entryLotId, setEntryLotId] = useState('');
  const [entryMeters, setEntryMeters] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  const [entryBarcode, setEntryBarcode] = useState('');
  const [entryLoading, setEntryLoading] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';
  const isOwner = userRole === 'OWNER';

  // ── Derived ──────────────────────────────────────────────────────────────

  const availableColors = useMemo(() => {
    const set = new Set<string>();
    rolls.forEach(r => { const c = rollDisplayColor(r); if (c) set.add(c); });
    return [...set].sort();
  }, [rolls]);

  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    rolls.forEach(r => { if (r.location) set.add(r.location); });
    return [...set].sort();
  }, [rolls]);

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
    const minM = minMeters ? parseFloat(minMeters) : null;
    const maxM = maxMeters ? parseFloat(maxMeters) : null;

    return tabRolls.filter(r => {
      const displayColor = rollDisplayColor(r);
      const rollNum = displayRollNumber(r.rollNumber);

      const matchSearch = !q ||
        (r.disaNumber ?? '').toLowerCase().includes(q) ||
        rollNum.toLowerCase().includes(q) ||
        r.rollNumber.toLowerCase().includes(q) ||
        (r.barcode ?? '').toLowerCase().includes(q) ||
        r.product.name.toLowerCase().includes(q) ||
        r.product.code.toLowerCase().includes(q) ||
        displayColor.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q);

      const matchCat = !categoryFilter || r.category.name?.toLowerCase() === categoryFilter.toLowerCase();
      const matchStatus = !statusFilter
        ? true
        : statusFilter === 'REMNANT'
          ? r.isRemnant && r.status === 'ACTIVE'
          : r.status === statusFilter;
      const matchColor = !colorFilter || displayColor === colorFilter;
      const matchMinM = minM === null || r.currentMeters >= minM;
      const matchMaxM = maxM === null || r.currentMeters <= maxM;
      const matchLoc = !locationFilter || r.location.toLowerCase().includes(locationFilter.toLowerCase());

      return matchSearch && matchCat && matchStatus && matchColor && matchMinM && matchMaxM && matchLoc;
    });
  }, [tabRolls, search, categoryFilter, statusFilter, colorFilter, minMeters, maxMeters, locationFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilterCount = [search, categoryFilter, statusFilter, colorFilter, locationFilter, minMeters, maxMeters].filter(Boolean).length;
  const remnantCount = rolls.filter(r => r.isRemnant && r.status === 'ACTIVE').length;

  const rollsForProduct = useMemo(() => {
    if (!exitProductId) return [];
    return rolls
      .filter(r => r.status === 'ACTIVE' && r.product.id === parseInt(exitProductId))
      .sort((a, b) => a.currentMeters - b.currentMeters);
  }, [rolls, exitProductId]);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter, colorFilter, minMeters, maxMeters, locationFilter, tab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateUrl({ q: search, cat: categoryFilter, status: statusFilter, color: colorFilter, minM: minMeters, maxM: maxMeters, loc: locationFilter });
    }, 350);
    return () => clearTimeout(timer);
  }, [search, categoryFilter, statusFilter, colorFilter, minMeters, maxMeters, locationFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch(''); setCategoryFilter(''); setStatusFilter('');
    setColorFilter(''); setMinMeters(''); setMaxMeters(''); setLocationFilter('');
    updateUrl({});
  }

  function openExitFlow(preselectedRoll?: Roll) {
    setShowExit(true);
    setExitStep(preselectedRoll ? 'confirm' : 'product');
    setExitPrevStep('roll');
    setExitProductId(preselectedRoll ? String(preselectedRoll.product.id) : '');
    setExitRoll(preselectedRoll ?? null);
    setExitType('EXIT_PARTIAL');
    setExitMeters(''); setExitClient(''); setExitNotes('');
    setRemnantWarning([]);
  }

  function closeExit() {
    setShowExit(false);
    setExitStep('product'); setExitPrevStep('roll');
    setExitProductId(''); setExitRoll(null);
    setExitMeters(''); setExitClient(''); setExitNotes('');
    setRemnantWarning([]);
  }

  async function handleProductNext() {
    if (!exitProductId) return;
    const remnants = rolls.filter(r => r.status === 'ACTIVE' && r.isRemnant && r.product.id === parseInt(exitProductId));
    if (remnants.length > 0) { setRemnantWarning(remnants); setExitStep('remnant-check'); }
    else { setExitStep('roll'); }
  }

  async function handleExit() {
    if (!exitRoll || !exitClient) return;
    if (exitType === 'EXIT_PARTIAL' && (!exitMeters || parseFloat(exitMeters) <= 0)) {
      setToast({ message: 'Ingresa los metros a cortar', type: 'error' }); return;
    }
    if (exitType === 'EXIT_PARTIAL' && parseFloat(exitMeters) > exitRoll.currentMeters) {
      setToast({ message: `Máximo disponible: ${exitRoll.currentMeters}m`, type: 'error' }); return;
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
      if (!res.ok) { setToast({ message: data.error ?? 'Error al registrar salida', type: 'error' }); return; }
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
      setToast({ message: 'Completa todos los campos requeridos', type: 'error' }); return;
    }
    setEntryLoading(true);
    try {
      const res = await fetch('/api/inventory/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollNumber: entryRollNumber,
          disaNumber: entryDisaNumber || null,
          productId: parseInt(entryProductId),
          lotId: parseInt(entryLotId),
          initialMeters: parseFloat(entryMeters),
          location: entryLocation,
          barcode: entryBarcode || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setToast({ message: data.error ?? 'Error al registrar entrada', type: 'error' }); return; }
      setToast({ message: 'Rollo registrado correctamente. Recargando...', type: 'success' });
      setShowEntry(false);
      setEntryRollNumber(''); setEntryDisaNumber(''); setEntryProductId(''); setEntryLotId('');
      setEntryMeters(''); setEntryLocation(''); setEntryBarcode('');
      router.refresh();
    } catch {
      setToast({ message: 'Error de conexión', type: 'error' });
    } finally {
      setEntryLoading(false);
    }
  }

  // Columns: Cons.DISA | No.Rollo | Referencia | Producto/Color | Ancho | Metros | Estado | Ubicación | [B2B] | Acciones
  const colCount = isOwner ? 10 : 9;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rolls.filter(r => r.status === 'ACTIVE').length} rollos activos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openExitFlow()} className="bg-[#0A0A0A] text-white text-sm font-medium px-4 py-2 rounded hover:bg-[#1A1A1A] transition-colors">
            ↑ Nueva salida
          </button>
          {canManage && (
            <button onClick={() => setShowEntry(true)} className="bg-white border border-[#E5E5E5] text-gray-700 text-sm font-medium px-4 py-2 rounded hover:bg-gray-50 transition-colors">
              + Nueva entrada
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#E5E5E5]">
        {(['all', 'remnants'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'all' ? 'Todos los rollos' : 'Remanentes'}
            {t === 'remnants' && remnantCount > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{remnantCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filter bar — Desktop ── */}
      <div className="hidden md:flex flex-wrap gap-2 mb-3 items-center">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⊘</span>
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por N° DISA, rollo, ref., producto, color, ubicación..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E5E5] rounded text-sm focus:outline-none focus:border-gray-400"
            autoComplete="off" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Categoría</option>
          <option value="Velo">Velo</option>
          <option value="Blackout">Blackout</option>
        </select>
        {tab === 'all' && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
            <option value="">Estado</option>
            <option value="ACTIVE">Activo</option>
            <option value="REMNANT">Remanente</option>
            <option value="DEPLETED">Agotado</option>
          </select>
        )}
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)} className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Color</option>
          {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input type="number" min="0" step="1" value={minMeters} onChange={e => setMinMeters(e.target.value)} placeholder="Min m"
            className="w-20 border border-[#E5E5E5] bg-white rounded px-2 py-2 text-sm focus:outline-none focus:border-gray-400" />
          <span className="text-gray-400 text-xs">–</span>
          <input type="number" min="0" step="1" value={maxMeters} onChange={e => setMaxMeters(e.target.value)} placeholder="Max m"
            className="w-20 border border-[#E5E5E5] bg-white rounded px-2 py-2 text-sm focus:outline-none focus:border-gray-400" />
        </div>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Ubicación</option>
          {availableLocations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-900 border border-[#E5E5E5] rounded px-3 py-2 hover:bg-gray-50 transition-colors">
            ✕ Limpiar ({activeFilterCount})
          </button>
        )}
      </div>

      {/* ── Filter bar — Mobile ── */}
      <div className="flex md:hidden gap-2 mb-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⊘</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E5E5] rounded text-sm focus:outline-none focus:border-gray-400" autoComplete="off" />
        </div>
        <button onClick={() => setShowFiltersPanel(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded text-sm transition-colors ${activeFilterCount > 0 ? 'border-gray-900 bg-gray-900 text-white' : 'border-[#E5E5E5] bg-white text-gray-700'}`}>
          Filtros
          {activeFilterCount > 0 && <span className="bg-white text-gray-900 text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full">{activeFilterCount}</span>}
          <span className="text-xs">{showFiltersPanel ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Mobile filter panel */}
      {showFiltersPanel && (
        <div className="md:hidden bg-white border border-[#E5E5E5] rounded-lg p-4 mb-3 space-y-3">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
            <option value="">Todas las categorías</option>
            <option value="Velo">Velo</option>
            <option value="Blackout">Blackout</option>
          </select>
          {tab === 'all' && (
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
              <option value="">Todos los estados</option>
              <option value="ACTIVE">Activo</option>
              <option value="REMNANT">Remanente</option>
              <option value="DEPLETED">Agotado</option>
            </select>
          )}
          <select value={colorFilter} onChange={e => setColorFilter(e.target.value)} className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
            <option value="">Todos los colores</option>
            {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Metros mín.</label>
              <input type="number" min="0" value={minMeters} onChange={e => setMinMeters(e.target.value)} placeholder="0"
                className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Metros máx.</label>
              <input type="number" min="0" value={maxMeters} onChange={e => setMaxMeters(e.target.value)} placeholder="∞"
                className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
            <option value="">Todas las ubicaciones</option>
            {availableLocations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {activeFilterCount > 0 && (
            <button onClick={() => { clearFilters(); setShowFiltersPanel(false); }} className="w-full text-sm text-gray-600 border border-[#E5E5E5] rounded px-3 py-2.5 hover:bg-gray-50">
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Counter */}
      <p className="text-xs text-gray-400 mb-2">
        Mostrando {filtered.length} de {tabRolls.length} rollos
        {activeFilterCount > 0 && <span> · <button onClick={clearFilters} className="text-blue-500 hover:underline">Limpiar filtros</button></span>}
      </p>

      {/* ── TABLE — Desktop/Tablet ── */}
      <div className="hidden sm:block bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Cons. DISA</th>
                <th className="px-4 py-3 text-left">No. Rollo</th>
                <th className="px-4 py-3 text-left">Referencia</th>
                <th className="px-4 py-3 text-left">Producto / Color</th>
                <th className="px-4 py-3 text-left">Ancho</th>
                <th className="px-4 py-3 text-left">Metros</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Ubicación</th>
                {isOwner && <th className="px-4 py-3 text-right">Precio B2B</th>}
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-gray-400">
                    {tab === 'remnants' ? 'No hay remanentes activos' : 'No se encontraron rollos'}
                  </td>
                </tr>
              ) : (
                paged.map(roll => {
                  const displayColor = rollDisplayColor(roll);
                  return (
                    <tr key={roll.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                      {/* Consecutivo DISA */}
                      <td className="px-4 py-3 font-mono text-sm">
                        {roll.disaNumber
                          ? <span className="font-bold text-gray-900">{roll.disaNumber}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>

                      {/* No. Rollo (proveedor, sin ceros) */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {displayRollNumber(roll.rollNumber)}
                      </td>

                      {/* Referencia = product code */}
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">
                        {roll.product.code}
                      </td>

                      {/* Producto / Color */}
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 leading-tight">{roll.product.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{displayColor}</div>
                      </td>

                      {/* Ancho */}
                      <td className="px-4 py-3 text-xs text-gray-500">{roll.product.width} cm</td>

                      {/* Metros */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 bg-gray-100 rounded-full h-1.5 flex-shrink-0">
                            <div className={`h-1.5 rounded-full ${roll.isRemnant ? 'bg-amber-400' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, (roll.currentMeters / (roll.initialMeters || 1)) * 100)}%` }} />
                          </div>
                          <span className={`text-xs tabular-nums font-medium ${roll.isRemnant ? 'text-amber-600' : 'text-gray-700'}`}>
                            {roll.currentMeters}m
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">/ {roll.initialMeters}m</div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                          roll.isRemnant && roll.status === 'ACTIVE'
                            ? 'bg-amber-100 text-amber-700'
                            : STATUS_CLASS[roll.status] ?? 'bg-gray-100 text-gray-600'
                        }`}>
                          {roll.isRemnant && roll.status === 'ACTIVE' ? 'Remanente' : STATUS_LABEL[roll.status] ?? roll.status}
                        </span>
                      </td>

                      {/* Ubicación */}
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{roll.location}</td>

                      {/* Precio B2B — solo OWNER */}
                      {isOwner && (
                        <td className="px-4 py-3 text-right text-gray-700 tabular-nums text-xs">
                          {formatCOP(roll.product.priceB2B)}
                        </td>
                      )}

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {roll.status === 'ACTIVE' && (
                            <button onClick={() => openExitFlow(roll)}
                              className="text-xs bg-gray-900 text-white px-2.5 py-1.5 rounded hover:bg-gray-700 transition-colors">
                              Salida
                            </button>
                          )}
                          <Link href={`/inventory/${roll.id}`} title="Ver trazabilidad"
                            className="text-base text-gray-400 hover:text-gray-700 border border-[#E5E5E5] w-8 h-8 flex items-center justify-center rounded hover:bg-gray-50 transition-colors">
                            🔍
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[#E5E5E5] flex items-center justify-between">
            <span className="text-gray-500 text-xs">Página {page} de {totalPages} · {filtered.length} rollos</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40">← Anterior</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40">Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── CARDS — Mobile ── */}
      <div className="sm:hidden space-y-2">
        {paged.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E5E5] px-4 py-10 text-center text-gray-400 text-sm">
            {tab === 'remnants' ? 'No hay remanentes activos' : 'No se encontraron rollos'}
          </div>
        ) : (
          paged.map(roll => {
            const displayColor = rollDisplayColor(roll);
            const statusLabel = roll.isRemnant && roll.status === 'ACTIVE' ? 'Remanente' : STATUS_LABEL[roll.status] ?? roll.status;
            const statusClass = roll.isRemnant && roll.status === 'ACTIVE' ? 'bg-amber-100 text-amber-700' : STATUS_CLASS[roll.status] ?? 'bg-gray-100 text-gray-600';
            return (
              <div key={roll.id} className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                {/* Header row */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {roll.disaNumber
                      ? <span className="font-bold text-gray-900 font-mono text-base">{roll.disaNumber}</span>
                      : <span className="text-gray-400 text-sm font-mono">Sin N° DISA</span>}
                    <span className="text-gray-400 text-xs ml-2">No. {displayRollNumber(roll.rollNumber)}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
                </div>
                {/* Product info */}
                <div className="text-sm text-gray-800 font-medium">{roll.product.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                  <span>Ref: <span className="font-mono font-semibold text-gray-700">{roll.product.code}</span></span>
                  <span>Color: {displayColor}</span>
                  <span>Ancho: {roll.product.width} cm</span>
                </div>
                {/* Meters + location */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${roll.isRemnant ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, (roll.currentMeters / (roll.initialMeters || 1)) * 100)}%` }} />
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${roll.isRemnant ? 'text-amber-600' : 'text-gray-800'}`}>
                      {roll.currentMeters}m
                    </span>
                    <span className="text-xs text-gray-400">/ {roll.initialMeters}m</span>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">{roll.location}</span>
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  {roll.status === 'ACTIVE' && (
                    <button onClick={() => openExitFlow(roll)}
                      className="flex-1 text-sm bg-gray-900 text-white py-2.5 rounded font-medium hover:bg-gray-700 transition-colors">
                      ↑ Salida
                    </button>
                  )}
                  <Link href={`/inventory/${roll.id}`}
                    className={`${roll.status === 'ACTIVE' ? '' : 'flex-1'} text-sm border border-[#E5E5E5] text-gray-600 py-2.5 px-3 rounded hover:bg-gray-50 transition-colors flex items-center justify-center gap-1`}>
                    🔍 <span>Trazabilidad</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-1">
            <span className="text-xs text-gray-400">Pág {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 border border-[#E5E5E5] rounded text-sm hover:bg-gray-50 disabled:opacity-40">← Ant.</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 border border-[#E5E5E5] rounded text-sm hover:bg-gray-50 disabled:opacity-40">Sig. →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── EXIT MODAL ── */}
      {showExit && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center sm:p-4" onClick={closeExit}>
          <div className="bg-white w-full sm:rounded-xl rounded-t-2xl shadow-2xl sm:max-w-lg max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#F0F0F0]">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Nueva salida</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {exitStep === 'product' && 'Paso 1 de 3 — Selecciona la referencia'}
                  {exitStep === 'remnant-check' && 'Aviso — Remanentes disponibles'}
                  {exitStep === 'roll' && 'Paso 2 de 3 — Selecciona el rollo'}
                  {exitStep === 'confirm' && 'Paso 3 de 3 — Confirmar salida'}
                </p>
              </div>
              <button onClick={closeExit} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5">
              {exitStep === 'product' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                      Referencia <span className="text-red-400">*</span>
                    </label>
                    <select value={exitProductId} onChange={e => setExitProductId(e.target.value)} autoFocus
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400">
                      <option value="">Seleccionar referencia</option>
                      {products.map(p => {
                        const activeCount = rolls.filter(r => r.status === 'ACTIVE' && r.product.id === p.id).length;
                        return (
                          <option key={p.id} value={p.id} disabled={activeCount === 0}>
                            {p.code} — {p.name} ({activeCount} rollos activos)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={closeExit} className="flex-1 border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                    <button type="button" onClick={handleProductNext} disabled={!exitProductId} className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-40">Siguiente →</button>
                  </div>
                </div>
              )}

              {exitStep === 'remnant-check' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-amber-800 text-sm font-semibold mb-2">⚠ {remnantWarning.length} remanente{remnantWarning.length > 1 ? 's' : ''} disponibles</p>
                    <p className="text-amber-700 text-xs mb-3">Se recomienda agotar los remanentes antes de cortar rollos completos.</p>
                    <div className="space-y-1">
                      {remnantWarning.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-white border border-amber-200 rounded px-3 py-2 text-xs">
                          <span className="font-mono text-gray-600">{r.disaNumber ?? displayRollNumber(r.rollNumber)}</span>
                          <span className="font-semibold text-amber-700">{r.currentMeters} m</span>
                          <span className="text-gray-400">{r.location}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setExitStep('product')} className="flex-1 border border-[#E5E5E5] rounded px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50">← Volver</button>
                    <button type="button" onClick={() => { setExitRoll(remnantWarning[0]); setExitPrevStep('remnant-check'); setExitStep('confirm'); }}
                      className="flex-1 bg-amber-500 text-white rounded px-3 py-2.5 text-sm font-medium hover:bg-amber-600">Usar remanente</button>
                    <button type="button" onClick={() => setExitStep('roll')} className="flex-1 bg-[#0A0A0A] text-white rounded px-3 py-2.5 text-sm font-medium hover:bg-[#1A1A1A]">Continuar igual</button>
                  </div>
                </div>
              )}

              {exitStep === 'roll' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">{rollsForProduct.length} rollo{rollsForProduct.length !== 1 ? 's' : ''} activos disponibles</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {rollsForProduct.map(r => (
                      <button key={r.id} type="button"
                        onClick={() => { setExitRoll(r); setExitPrevStep('roll'); setExitStep('confirm'); }}
                        className={`w-full flex items-center justify-between border rounded-lg px-4 py-3 text-sm hover:border-gray-400 transition-colors min-h-[44px] ${exitRoll?.id === r.id ? 'border-gray-900 bg-gray-50' : 'border-[#E5E5E5]'}`}>
                        <div className="text-left">
                          <div className="font-semibold text-gray-800 text-sm">{r.disaNumber ?? '—'}</div>
                          <div className="text-xs text-gray-400">Rollo {displayRollNumber(r.rollNumber)} · {r.location}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold ${r.isRemnant ? 'text-amber-600' : 'text-green-700'}`}>{r.currentMeters} m</div>
                          {r.isRemnant && <div className="text-xs text-amber-500">Remanente</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setExitStep('product')} className="w-full border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">← Volver</button>
                </div>
              )}

              {exitStep === 'confirm' && exitRoll && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-400 block text-xs">N° DISA</span><span className="font-bold">{exitRoll.disaNumber ?? '—'}</span></div>
                    <div><span className="text-gray-400 block text-xs">Ref.</span><span className="font-mono font-semibold text-xs">{exitRoll.product.code}</span></div>
                    <div><span className="text-gray-400 block text-xs">Producto</span><span className="font-medium text-sm">{exitRoll.product.name}</span></div>
                    <div><span className="text-gray-400 block text-xs">Color</span><span>{rollDisplayColor(exitRoll)}</span></div>
                    <div><span className="text-gray-400 block text-xs">No. Rollo</span><span className="font-mono text-xs">{displayRollNumber(exitRoll.rollNumber)}</span></div>
                    <div><span className="text-gray-400 block text-xs">Disponibles</span><span className={`font-semibold ${exitRoll.isRemnant ? 'text-amber-600' : 'text-green-700'}`}>{exitRoll.currentMeters} m</span></div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Tipo de salida</label>
                    <div className="flex gap-2">
                      {(['EXIT_PARTIAL', 'EXIT_FULL'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setExitType(t)}
                          className={`flex-1 border rounded-lg px-3 py-3 text-sm text-left transition-colors min-h-[44px] ${exitType === t ? 'border-gray-900 bg-gray-50' : 'border-[#E5E5E5] hover:border-gray-400'}`}>
                          <div className="font-semibold text-gray-900 text-xs mb-0.5">{t === 'EXIT_PARTIAL' ? 'Salida parcial' : 'Salida total'}</div>
                          <div className="text-xs text-gray-400">{t === 'EXIT_PARTIAL' ? 'Corte por metros' : `Completo (${exitRoll.currentMeters}m)`}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {exitType === 'EXIT_PARTIAL' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                        Metros a cortar <span className="text-red-400">*</span>
                      </label>
                      <input type="number" step="0.1" min="0.1" max={exitRoll.currentMeters} value={exitMeters}
                        onChange={e => setExitMeters(e.target.value)} autoFocus
                        className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                        placeholder={`Máx. ${exitRoll.currentMeters} m`} />
                      {exitMeters && parseFloat(exitMeters) > 0 && parseFloat(exitMeters) <= exitRoll.currentMeters && (
                        <p className="text-xs text-gray-400 mt-1">
                          Quedarán {(exitRoll.currentMeters - parseFloat(exitMeters)).toFixed(1)} m
                          {exitRoll.currentMeters - parseFloat(exitMeters) <= 10 && exitRoll.currentMeters - parseFloat(exitMeters) > 0 ? ' → se marcará como remanente' : ''}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                      Cliente <span className="text-red-400">*</span>
                    </label>
                    <ClientCombobox
                      clients={clientsList}
                      value={exitClient}
                      onChange={setExitClient}
                      onClientCreated={newC => setClientsList(prev => [...prev, newC].sort((a, b) => a.name.localeCompare(b.name)))}
                      placeholder="Seleccionar o crear cliente..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">Notas</label>
                    <textarea value={exitNotes} onChange={e => setExitNotes(e.target.value)} rows={2}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-gray-400"
                      placeholder="Observaciones opcionales..." />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setExitStep(exitPrevStep)} className="border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">← Volver</button>
                    <button type="button" onClick={handleExit}
                      disabled={exitLoading || !exitClient || (exitType === 'EXIT_PARTIAL' && !exitMeters)}
                      className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-50">
                      {exitLoading ? 'Registrando...' : 'Confirmar salida'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ENTRY MODAL ── */}
      {showEntry && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowEntry(false)}>
          <div className="bg-white w-full sm:rounded-xl rounded-t-2xl shadow-2xl sm:max-w-md p-6 max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nueva entrada</h2>
              <button onClick={() => setShowEntry(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleEntry} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                  Consecutivo DISA <span className="text-gray-400 font-normal">(el número rojo de la etiqueta)</span>
                </label>
                <input type="text" value={entryDisaNumber} onChange={e => setEntryDisaNumber(e.target.value)}
                  className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                  placeholder="Ej. 2946" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                  No. Rollo proveedor <span className="text-red-400">*</span>
                </label>
                <input type="text" value={entryRollNumber} onChange={e => setEntryRollNumber(e.target.value)} required
                  className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                  placeholder="Ej. 42" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                  Producto <span className="text-red-400">*</span>
                </label>
                <select value={entryProductId} onChange={e => setEntryProductId(e.target.value)} required
                  className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400">
                  <option value="">Seleccionar producto</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name} {p.color ? `(Color ${p.color})` : ''} {p.width}cm</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Lote <span className="text-red-400">*</span>
                  </label>
                  <select value={entryLotId} onChange={e => setEntryLotId(e.target.value)} required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400">
                    <option value="">Seleccionar</option>
                    {lots.map(l => <option key={l.id} value={l.id}>{l.lotNumber}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Metros <span className="text-red-400">*</span>
                  </label>
                  <input type="number" step="0.1" min="1" value={entryMeters} onChange={e => setEntryMeters(e.target.value)} required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400" placeholder="150" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Ubicación <span className="text-red-400">*</span>
                  </label>
                  <input type="text" value={entryLocation} onChange={e => setEntryLocation(e.target.value)} required
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400" placeholder="A-01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Barcode <span className="text-gray-400 font-normal">(opc.)</span>
                  </label>
                  <input type="text" value={entryBarcode} onChange={e => setEntryBarcode(e.target.value)}
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400" placeholder="opcional" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEntry(false)} className="flex-1 border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={entryLoading} className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-50">
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
