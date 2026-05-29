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

interface Product {
  id: number; name: string; code: string; color: string; width: number;
  categoryId: number;
}
interface Lot { id: number; lotNumber: string }

const SERVER_LIMIT = 100;

// Cambio 3: REMNANT is now its own status
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  REMNANT: 'Remanente',
  DEPLETED: 'Agotado',
  DEFECTIVE: 'Defectuoso',
  WRITTEN_OFF: 'Dado de baja',
};
const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  REMNANT: 'bg-amber-100 text-amber-700',
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

// Cambio 2: formatted reference — Blackout shows "2306-2", Velo shows "2238"
function formatRef(code: string, isBlackout: boolean): string {
  const parts = code.split('-');
  return isBlackout ? `${parts[0]}-${parts[1] ?? ''}` : parts[0];
}

// Strip the base code number from the product name to avoid redundancy
function productDisplayName(name: string, code: string): string {
  const base = code.split('-')[0];
  const cleaned = name.replace(new RegExp(`\\b${base}\\b`, 'g'), '').trim().replace(/\s+/g, ' ');
  return cleaned || name;
}

function rollColor(roll: Roll): string {
  if (isBlackoutProduct(roll.category.name)) {
    return getBlackoutColorName(roll.product.color);
  }
  return roll.product.color;
}

function updateUrl(filters: Record<string, string>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  ['q', 'cat', 'status', 'color', 'p'].forEach(k => url.searchParams.delete(k));
  Object.entries(filters).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  window.history.replaceState({}, '', url.toString());
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
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
  initialRolls, initialTotal, initialTotalPages, initialRemnantCount, initialActiveCount,
  clients: initialClients, products, lots, userRole,
  initialTab = 'all', openExitModal = false,
  initialSearch = '', initialCategory = '', initialStatus = '',
  initialColor = '', initialMinMeters = '', initialMaxMeters = '', initialLocation = '',
}: {
  initialRolls: Roll[];
  initialTotal: number;
  initialTotalPages: number;
  initialRemnantCount: number;
  initialActiveCount: number;
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

  // Server-side pagination
  const [serverPage, setServerPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(initialTotal);
  const [serverTotalPages, setServerTotalPages] = useState(initialTotalPages);
  const [isFetching, setIsFetching] = useState(false);

  // Filters (4 client-side filters — no server calls on change)
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [colorFilter, setColorFilter] = useState(initialColor);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // Exit modal
  const [showExit, setShowExit] = useState(openExitModal);
  const [exitStep, setExitStep] = useState<ExitStep>('product');
  const [exitProductId, setExitProductId] = useState('');
  const [exitRoll, setExitRoll] = useState<Roll | null>(null);
  const [exitType, setExitType] = useState<'EXIT_FULL' | 'EXIT_PARTIAL'>('EXIT_PARTIAL');
  const [exitMeters, setExitMeters] = useState('');
  const [exitClient, setExitClient] = useState('');
  const [exitPricePerMeter, setExitPricePerMeter] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [exitLoading, setExitLoading] = useState(false);
  const [remnantWarning, setRemnantWarning] = useState<Roll[]>([]);
  const [exitPrevStep, setExitPrevStep] = useState<ExitStep>('roll');
  const [exitProductRolls, setExitProductRolls] = useState<Roll[]>([]);

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
  const isFirstMount = useRef(true);

  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';
  const isOwner = userRole === 'OWNER';

  // Cambio 2: 10 cols (non-owner) + 1 B2B col for owner = 11
  const colCount = isOwner ? 11 : 10;

  // ── Derived ──────────────────────────────────────────────────────────────

  // Raw Product.color values (numbers for Blackout, names for Velo)
  const availableColors = useMemo(() => {
    const set = new Set<string>();
    rolls.forEach(r => { if (r.product.color) set.add(r.product.color); });
    return [...set].sort();
  }, [rolls]);

  // Client-side filtering on the loaded page (no server calls)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rolls.filter(r => {
      const matchSearch = !q || [
        r.disaNumber ?? '',
        r.rollNumber,
        r.product.code,
        r.product.name,
      ].some(s => s.toLowerCase().includes(q));

      const matchCategory = !categoryFilter ||
        (categoryFilter === 'Velo' ? r.category.id === 1 : r.category.id === 2);

      const matchColor = !colorFilter || r.product.color === colorFilter;

      const matchStatus = !statusFilter || r.status === statusFilter;

      return matchSearch && matchCategory && matchColor && matchStatus;
    });
  }, [rolls, search, categoryFilter, statusFilter, colorFilter]);

  const activeFilterCount = [search, categoryFilter, statusFilter, colorFilter].filter(Boolean).length;
  const remnantCount = initialRemnantCount;

  // ── Effects ──────────────────────────────────────────────────────────────

  // Load data on page change or tab change — no filter params sent to server
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      // SSR already loaded page 1, skip fetch on first mount
      if (serverPage === 1 && tab === 'all') return;
    }
    const ctrl = new AbortController();
    const params = new URLSearchParams({ page: String(serverPage), limit: String(SERVER_LIMIT) });
    if (tab === 'remnants') params.set('isRemnant', 'true');
    setIsFetching(true);
    fetch(`/api/inventory?${params}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setRolls(json.data);
          setServerTotal(json.total ?? 0);
          setServerTotalPages(json.totalPages ?? 1);
        }
      })
      .catch(e => { if (e.name !== 'AbortError') console.error('inventory fetch error:', e); })
      .finally(() => setIsFetching(false));
    return () => ctrl.abort();
  }, [serverPage, tab]);

  // URL sync (debounced, filters only — no server call)
  useEffect(() => {
    const t = setTimeout(() => {
      updateUrl({ q: search, cat: categoryFilter, status: statusFilter, color: colorFilter, p: serverPage > 1 ? String(serverPage) : '' });
    }, 350);
    return () => clearTimeout(t);
  }, [search, categoryFilter, statusFilter, colorFilter, serverPage]);

  // Auto-fill price when FIXED client is selected
  useEffect(() => {
    if (!exitClient) { setExitPricePerMeter(''); return; }
    const client = clientsList.find(c => String(c.id) === exitClient);
    if (client?.type === 'DISTRIBUTOR' && client.pricePerMeter) {
      setExitPricePerMeter(String(client.pricePerMeter));
    } else if (client?.type !== 'DISTRIBUTOR') {
      setExitPricePerMeter('');
    }
  }, [exitClient, clientsList]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch(''); setCategoryFilter(''); setStatusFilter(''); setColorFilter('');
    updateUrl({});
  }

  function openExitFlow(preselectedRoll?: Roll) {
    setShowExit(true);
    setExitStep(preselectedRoll ? 'confirm' : 'product');
    setExitPrevStep('roll');
    setExitProductId(preselectedRoll ? String(preselectedRoll.product.id) : '');
    setExitRoll(preselectedRoll ?? null);
    setExitProductRolls([]);
    setExitType('EXIT_PARTIAL');
    setExitMeters(''); setExitClient(''); setExitPricePerMeter(''); setExitNotes('');
    setRemnantWarning([]);
  }

  function closeExit() {
    setShowExit(false);
    setExitStep('product'); setExitPrevStep('roll');
    setExitProductId(''); setExitRoll(null);
    setExitProductRolls([]);
    setExitMeters(''); setExitClient(''); setExitPricePerMeter(''); setExitNotes('');
    setRemnantWarning([]);
  }

  async function handleProductNext() {
    if (!exitProductId) return;
    try {
      const params = new URLSearchParams({ status: 'ACTIVE', productId: exitProductId, limit: '500' });
      // Also fetch REMNANT rolls
      const [activeRes, remnantRes] = await Promise.all([
        fetch(`/api/inventory?${params}`),
        fetch(`/api/inventory?status=REMNANT&productId=${exitProductId}&limit=500`),
      ]);
      const activeJson = await activeRes.json();
      const remnantJson = await remnantRes.json();
      const activeRolls: Roll[] = [...(activeJson.data ?? []), ...(remnantJson.data ?? [])];
      const remnants = activeRolls.filter(r => r.status === 'REMNANT');
      setExitProductRolls(activeRolls.sort((a, b) => a.currentMeters - b.currentMeters));
      if (remnants.length > 0) { setRemnantWarning(remnants); setExitStep('remnant-check'); }
      else { setExitStep('roll'); }
    } catch {
      setToast({ message: 'Error al cargar rollos', type: 'error' });
    }
  }

  async function handleExit() {
    if (!exitRoll || !exitClient) return;
    if (exitType === 'EXIT_PARTIAL' && (!exitMeters || parseFloat(exitMeters) <= 0)) {
      setToast({ message: 'Ingresa los metros a cortar', type: 'error' }); return;
    }
    if (exitType === 'EXIT_PARTIAL' && parseFloat(exitMeters) > exitRoll.currentMeters) {
      setToast({ message: `Máximo disponible: ${exitRoll.currentMeters}m`, type: 'error' }); return;
    }
    const priceNum = parseFloat(exitPricePerMeter);
    if (!exitPricePerMeter || isNaN(priceNum) || priceNum <= 0) {
      setToast({ message: 'Ingresa un precio por metro válido', type: 'error' }); return;
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
          pricePerMeter: priceNum,
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-0.5">{initialActiveCount} rollos activos</p>
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
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'all' ? 'Todos los rollos' : 'Remanentes'}
            {t === 'remnants' && remnantCount > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{remnantCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filter bar — Desktop ── */}
      <div className="hidden md:flex flex-wrap gap-2 mb-3 items-center">
        {/* 1. Búsqueda libre */}
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⊘</span>
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E5E5] rounded text-sm focus:outline-none focus:border-gray-400" autoComplete="off" />
        </div>
        {/* 2. Categoría */}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Todas</option>
          <option value="Velo">Velo</option>
          <option value="Blackout">Blackout</option>
        </select>
        {/* 3. Color (raw Product.color values) */}
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Color</option>
          {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* 4. Estado */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Estado</option>
          <option value="ACTIVE">Activo</option>
          <option value="REMNANT">Remanente</option>
          <option value="DEPLETED">Agotado</option>
        </select>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-900 border border-[#E5E5E5] rounded px-3 py-2 hover:bg-gray-50 transition-colors">
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

      {showFiltersPanel && (
        <div className="md:hidden bg-white border border-[#E5E5E5] rounded-lg p-4 mb-3 space-y-3">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
            <option value="">Todas las categorías</option>
            <option value="Velo">Velo</option>
            <option value="Blackout">Blackout</option>
          </select>
          <select value={colorFilter} onChange={e => setColorFilter(e.target.value)}
            className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
            <option value="">Todos los colores</option>
            {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="w-full border border-[#E5E5E5] bg-white rounded px-3 py-2.5 text-sm focus:outline-none">
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activo</option>
            <option value="REMNANT">Remanente</option>
            <option value="DEPLETED">Agotado</option>
          </select>
          {activeFilterCount > 0 && (
            <button onClick={() => { clearFilters(); setShowFiltersPanel(false); }}
              className="w-full text-sm text-gray-600 border border-[#E5E5E5] rounded px-3 py-2.5 hover:bg-gray-50">
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Counter */}
      <p className="text-xs text-gray-400 mb-2 flex items-center gap-2">
        {isFetching
          ? <span>Cargando...</span>
          : rolls.length === 0
            ? 'Sin resultados'
            : <span>
                Mostrando {filtered.length} de {rolls.length} rollos
                {serverTotalPages > 1 && <span className="text-gray-300"> (pág. {serverPage}/{serverTotalPages})</span>}
              </span>
        }
        {activeFilterCount > 0 && !isFetching && (
          <span>· <button onClick={clearFilters} className="text-blue-500 hover:underline">Limpiar filtros</button></span>
        )}
      </p>

      {/* ── TABLE — Desktop/Tablet ── */}
      <div className={`hidden sm:block bg-white rounded-lg border border-[#E5E5E5] overflow-hidden transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Consecutivo</th>
                <th className="px-4 py-3 text-left">No. Rollo</th>
                <th className="px-4 py-3 text-left">Referencia</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Color</th>
                <th className="px-4 py-3 text-left">Ancho</th>
                <th className="px-4 py-3 text-left">Metros</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Ubicación</th>
                {isOwner && <th className="px-4 py-3 text-right">Precio B2B</th>}
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-gray-400">
                    {activeFilterCount > 0 ? 'Sin resultados con estos filtros' : tab === 'remnants' ? 'No hay remanentes' : 'No se encontraron rollos'}
                  </td>
                </tr>
              ) : (
                filtered.map(roll => {
                  const isBlackout = isBlackoutProduct(roll.category.name);
                  const ref = formatRef(roll.product.code, isBlackout);
                  const color = rollColor(roll);
                  const pName = productDisplayName(roll.product.name, roll.product.code);
                  const isRemnantRoll = roll.status === 'REMNANT';
                  return (
                    <tr key={roll.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm">
                        {roll.disaNumber
                          ? <span className="font-bold text-gray-900">{roll.disaNumber}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{displayRollNumber(roll.rollNumber)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{ref}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{pName}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{color}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{roll.product.width} cm</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 bg-gray-100 rounded-full h-1.5 flex-shrink-0">
                            <div className={`h-1.5 rounded-full ${isRemnantRoll ? 'bg-amber-400' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, (roll.currentMeters / (roll.initialMeters || 1)) * 100)}%` }} />
                          </div>
                          <span className={`text-xs tabular-nums font-medium ${isRemnantRoll ? 'text-amber-600' : 'text-gray-700'}`}>
                            {roll.currentMeters}m
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">/ {roll.initialMeters}m</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[roll.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[roll.status] ?? roll.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{roll.location}</td>
                      {isOwner && (
                        <td className="px-4 py-3 text-right text-gray-700 tabular-nums text-xs">
                          {formatCOP(roll.product.priceB2B)}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {(roll.status === 'ACTIVE' || roll.status === 'REMNANT') && (
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
        {serverTotalPages > 1 && (
          <div className="px-4 py-3 border-t border-[#E5E5E5] flex items-center justify-between">
            <span className="text-gray-500 text-xs">Página {serverPage} de {serverTotalPages} · {serverTotal} rollos</span>
            <div className="flex gap-1">
              <button onClick={() => setServerPage(p => Math.max(1, p - 1))} disabled={serverPage === 1 || isFetching}
                className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40">← Anterior</button>
              <button onClick={() => setServerPage(p => Math.min(serverTotalPages, p + 1))} disabled={serverPage === serverTotalPages || isFetching}
                className="px-3 py-1.5 border border-[#E5E5E5] rounded text-xs hover:bg-gray-50 disabled:opacity-40">Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── CARDS — Mobile ── */}
      <div className={`sm:hidden space-y-2 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E5E5] px-4 py-10 text-center text-gray-400 text-sm">
            {activeFilterCount > 0 ? 'Sin resultados con estos filtros' : tab === 'remnants' ? 'No hay remanentes' : 'No se encontraron rollos'}
          </div>
        ) : (
          filtered.map(roll => {
            const isBlackout = isBlackoutProduct(roll.category.name);
            const ref = formatRef(roll.product.code, isBlackout);
            const color = rollColor(roll);
            const pName = productDisplayName(roll.product.name, roll.product.code);
            const isRemnantRoll = roll.status === 'REMNANT';
            return (
              <div key={roll.id} className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {roll.disaNumber
                      ? <span className="font-bold text-gray-900 font-mono text-base">{roll.disaNumber}</span>
                      : <span className="text-gray-400 text-sm font-mono">Sin Consecutivo</span>}
                    <span className="text-gray-400 text-xs ml-2">No. {displayRollNumber(roll.rollNumber)}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[roll.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[roll.status] ?? roll.status}
                  </span>
                </div>
                <div className="text-sm text-gray-800 font-medium">{pName}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                  <span>Ref: <span className="font-mono font-semibold text-gray-700">{ref}</span></span>
                  <span>Color: {color}</span>
                  <span>Ancho: {roll.product.width} cm</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${isRemnantRoll ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, (roll.currentMeters / (roll.initialMeters || 1)) * 100)}%` }} />
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${isRemnantRoll ? 'text-amber-600' : 'text-gray-800'}`}>
                      {roll.currentMeters}m
                    </span>
                    <span className="text-xs text-gray-400">/ {roll.initialMeters}m</span>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">{roll.location}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {(roll.status === 'ACTIVE' || roll.status === 'REMNANT') && (
                    <button onClick={() => openExitFlow(roll)}
                      className="flex-1 text-sm bg-gray-900 text-white py-2.5 rounded font-medium hover:bg-gray-700 transition-colors">
                      ↑ Salida
                    </button>
                  )}
                  <Link href={`/inventory/${roll.id}`}
                    className={`${(roll.status === 'ACTIVE' || roll.status === 'REMNANT') ? '' : 'flex-1'} text-sm border border-[#E5E5E5] text-gray-600 py-2.5 px-3 rounded hover:bg-gray-50 transition-colors flex items-center justify-center gap-1`}>
                    🔍 <span>Trazabilidad</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
        {serverTotalPages > 1 && (
          <div className="flex justify-between items-center pt-1">
            <span className="text-xs text-gray-400">Pág {serverPage}/{serverTotalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setServerPage(p => Math.max(1, p - 1))} disabled={serverPage === 1 || isFetching}
                className="px-4 py-2 border border-[#E5E5E5] rounded text-sm hover:bg-gray-50 disabled:opacity-40">← Ant.</button>
              <button onClick={() => setServerPage(p => Math.min(serverTotalPages, p + 1))} disabled={serverPage === serverTotalPages || isFetching}
                className="px-4 py-2 border border-[#E5E5E5] rounded text-sm hover:bg-gray-50 disabled:opacity-40">Sig. →</button>
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
                        const isBlackout = p.categoryId === 2;
                        const ref = formatRef(p.code, isBlackout);
                        const pName = productDisplayName(p.name, p.code);
                        return (
                          <option key={p.id} value={p.id}>
                            {ref} — {pName}
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
                  <p className="text-sm text-gray-500">{exitProductRolls.length} rollo{exitProductRolls.length !== 1 ? 's' : ''} disponibles</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {exitProductRolls.map(r => (
                      <button key={r.id} type="button"
                        onClick={() => { setExitRoll(r); setExitPrevStep('roll'); setExitStep('confirm'); }}
                        className={`w-full flex items-center justify-between border rounded-lg px-4 py-3 text-sm hover:border-gray-400 transition-colors min-h-[44px] ${exitRoll?.id === r.id ? 'border-gray-900 bg-gray-50' : 'border-[#E5E5E5]'}`}>
                        <div className="text-left">
                          <div className="font-semibold text-gray-800 text-sm">{r.disaNumber ?? '—'}</div>
                          <div className="text-xs text-gray-400">Rollo {displayRollNumber(r.rollNumber)} · {r.location}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold ${r.status === 'REMNANT' ? 'text-amber-600' : 'text-green-700'}`}>{r.currentMeters} m</div>
                          {r.status === 'REMNANT' && <div className="text-xs text-amber-500">Remanente</div>}
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
                    <div><span className="text-gray-400 block text-xs">Consecutivo</span><span className="font-bold">{exitRoll.disaNumber ?? '—'}</span></div>
                    <div><span className="text-gray-400 block text-xs">Ref.</span><span className="font-mono font-semibold text-xs">{formatRef(exitRoll.product.code, isBlackoutProduct(exitRoll.category.name))}</span></div>
                    <div><span className="text-gray-400 block text-xs">Producto</span><span className="font-medium text-sm">{productDisplayName(exitRoll.product.name, exitRoll.product.code)}</span></div>
                    <div><span className="text-gray-400 block text-xs">Color</span><span>{rollColor(exitRoll)}</span></div>
                    <div><span className="text-gray-400 block text-xs">No. Rollo</span><span className="font-mono text-xs">{displayRollNumber(exitRoll.rollNumber)}</span></div>
                    <div><span className="text-gray-400 block text-xs">Disponibles</span><span className={`font-semibold ${exitRoll.status === 'REMNANT' ? 'text-amber-600' : 'text-green-700'}`}>{exitRoll.currentMeters} m</span></div>
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

                  {/* Precio por metro — Cambio 4 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                      Precio por metro <span className="text-red-400">*</span>
                    </label>
                    <input type="number" step="100" min="1" value={exitPricePerMeter}
                      onChange={e => setExitPricePerMeter(e.target.value)}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                      placeholder="Ej. 25000" />
                    {exitPricePerMeter && parseFloat(exitPricePerMeter) > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Total estimado:&nbsp;
                        <span className="font-semibold text-gray-800">
                          {formatCOP(
                            parseFloat(exitPricePerMeter) *
                            (exitType === 'EXIT_FULL'
                              ? exitRoll.currentMeters
                              : (parseFloat(exitMeters) || 0))
                          )}
                        </span>
                      </p>
                    )}
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
                      disabled={exitLoading || !exitClient || !exitPricePerMeter || (exitType === 'EXIT_PARTIAL' && !exitMeters)}
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
                  Consecutivo <span className="text-gray-400 font-normal">(opc.)</span>
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
                  {products.map(p => {
                    const isBlackout = p.categoryId === 2;
                    const ref = formatRef(p.code, isBlackout);
                    const pName = productDisplayName(p.name, p.code);
                    return (
                      <option key={p.id} value={p.id}>{ref} — {pName} {p.width}cm</option>
                    );
                  })}
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
