'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientCombobox, { type ComboClient } from '@/components/ClientCombobox';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';
import { generateSalePDF } from '@/lib/generateSalePDF';
import { formatColombianDate } from '@/lib/dateUtils';

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
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function displayRollNumber(rollNumber: string): string {
  const n = parseInt(rollNumber, 10);
  return isNaN(n) ? rollNumber : String(n);
}

function formatRef(code: string, isBlackout: boolean): string {
  const parts = code.split('-');
  return isBlackout ? `${parts[0]}-${parts[1] ?? ''}` : parts[0];
}

function productDisplayName(name: string, code: string): string {
  const base = code.split('-')[0];
  const cleaned = name.replace(new RegExp(`\\b${base}\\b`, 'g'), '').trim().replace(/\s+/g, ' ');
  return cleaned || name;
}

function rollColor(roll: Roll): string {
  if (isBlackoutProduct(roll.category.name)) return getBlackoutColorName(roll.product.color);
  return roll.product.color;
}

function baseRef(code: string): string {
  return code.split('-')[0];
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

type ExitStep = 'roll-select' | 'confirm' | 'success';

interface SaleResultRoll {
  roll: Roll;
  meters: number;
  pricePerMeter: number;
  subtotal: number;
}

interface SaleResult {
  saleId: number;
  clientName: string;
  clientType: string;
  rolls: SaleResultRoll[];
  discount: number;
  subtotal: number;
  total: number;
  registradoPor: string;
}

export default function InventoryClient({
  initialRolls, initialTotal, initialTotalPages, initialRemnantCount, initialActiveCount,
  clients: initialClients, products, lots, userRole, userName,
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
  userName: string;
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

  const [serverPage, setServerPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(initialTotal);
  const [serverTotalPages, setServerTotalPages] = useState(initialTotalPages);
  const [isFetching, setIsFetching] = useState(false);

  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [colorFilter, setColorFilter] = useState(initialColor);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // ── Exit modal state ─────────────────────────────────────────────────────
  const [showExit, setShowExit] = useState(openExitModal);
  const [exitStep, setExitStep] = useState<ExitStep>('roll-select');
  const [wizardRolls, setWizardRolls] = useState<Roll[]>([]);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardSearch, setWizardSearch] = useState('');
  const [selectedRolls, setSelectedRolls] = useState<Roll[]>([]);

  // Per-roll state keyed by roll ID
  const [rollExitTypes, setRollExitTypes] = useState<Record<number, 'EXIT_FULL' | 'EXIT_PARTIAL'>>({});
  const [rollMeters, setRollMeters] = useState<Record<number, string>>({});
  const [rollPrices, setRollPrices] = useState<Record<number, string>>({});
  const [rollPriceLocked, setRollPriceLocked] = useState<Record<number, boolean>>({});
  const [rollPriceHints, setRollPriceHints] = useState<Record<number, string>>({});

  // Sale-level state
  const [exitClient, setExitClient] = useState('');
  const [exitClientName, setExitClientName] = useState('');
  const [exitDiscount, setExitDiscount] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [exitLoading, setExitLoading] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);

  // ── Entry modal state ────────────────────────────────────────────────────
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
  const colCount = isOwner ? 11 : 10;

  // ── Derived ──────────────────────────────────────────────────────────────

  const availableColors = useMemo(() => {
    const set = new Set<string>();
    rolls.forEach(r => { if (r.product.color) set.add(r.product.color); });
    return [...set].sort();
  }, [rolls]);

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

  const filteredWizardRolls = useMemo(() => {
    if (!wizardSearch.trim()) return wizardRolls;
    const q = wizardSearch.toLowerCase().trim();
    return wizardRolls.filter(r =>
      (r.disaNumber ?? '').toLowerCase().includes(q) ||
      r.product.code.toLowerCase().includes(q) ||
      r.rollNumber.toLowerCase().includes(q)
    );
  }, [wizardRolls, wizardSearch]);

  // Multi-roll real-time calculation
  const exitCalc = useMemo(() => {
    const rollItems = selectedRolls.map(roll => {
      const et = rollExitTypes[roll.id] ?? 'EXIT_PARTIAL';
      const meters = et === 'EXIT_FULL' ? roll.currentMeters : parseFloat(rollMeters[roll.id] || '0');
      const price = parseFloat(rollPrices[roll.id] || '0');
      return { roll, meters, price, subtotal: meters * price };
    });
    const subtotalGeneral = rollItems.reduce((s, x) => s + x.subtotal, 0);
    const disc = parseFloat(exitDiscount || '0');
    const discountAmount = subtotalGeneral * (disc / 100);
    return { rollItems, subtotalGeneral, disc, discountAmount, total: subtotalGeneral - discountAmount };
  }, [selectedRolls, rollExitTypes, rollMeters, rollPrices, exitDiscount]);

  const selectedClient = useMemo(
    () => clientsList.find(c => String(c.id) === exitClient) ?? null,
    [clientsList, exitClient],
  );

  const isGeneralClient = selectedClient?.type === 'GENERAL';

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
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

  useEffect(() => {
    const t = setTimeout(() => {
      updateUrl({ q: search, cat: categoryFilter, status: statusFilter, color: colorFilter, p: serverPage > 1 ? String(serverPage) : '' });
    }, 350);
    return () => clearTimeout(t);
  }, [search, categoryFilter, statusFilter, colorFilter, serverPage]);

  // Fetch prices for all selected rolls when client or selection changes
  useEffect(() => {
    setRollPrices({});
    setRollPriceLocked({});
    setRollPriceHints({});

    if (!exitClient || selectedRolls.length === 0) return;

    const client = clientsList.find(c => String(c.id) === exitClient);
    if (!client) return;

    const isFixed = client.type === 'FIXED' || client.type === 'DISTRIBUTOR';
    let priceClientId: string | null;
    if (isFixed) {
      priceClientId = exitClient;
    } else {
      const generalClient = clientsList.find(c => c.name === 'Cliente General');
      priceClientId = generalClient ? String(generalClient.id) : null;
    }
    if (!priceClientId) return;

    setFetchingPrices(true);
    Promise.all(
      selectedRolls.map(roll =>
        fetch(`/api/clients/price?clientId=${priceClientId}&ref=${baseRef(roll.product.code)}`)
          .then(r => r.json())
          .then(data => ({ rollId: roll.id, pricePerMeter: data.pricePerMeter ?? null }))
          .catch(() => ({ rollId: roll.id, pricePerMeter: null }))
      )
    ).then(results => {
      setRollPrices(() => {
        const next: Record<number, string> = {};
        results.forEach(({ rollId, pricePerMeter }) => {
          if (pricePerMeter !== null) next[rollId] = String(pricePerMeter);
        });
        return next;
      });
      setRollPriceLocked(() => {
        const next: Record<number, boolean> = {};
        results.forEach(({ rollId, pricePerMeter }) => {
          next[rollId] = isFixed && pricePerMeter !== null;
        });
        return next;
      });
      setRollPriceHints(() => {
        const next: Record<number, string> = {};
        results.forEach(({ rollId, pricePerMeter }) => {
          if (pricePerMeter !== null && !isFixed) {
            next[rollId] = 'Precio de lista sugerido. Puedes ajustarlo.';
          } else if (pricePerMeter === null && isFixed) {
            next[rollId] = 'Sin precio para esta referencia — ingresa manualmente';
          }
        });
        return next;
      });
    }).finally(() => setFetchingPrices(false));
  }, [exitClient, selectedRolls, clientsList]);

  // Force EXIT_FULL for all rolls when client sellsByRoll
  useEffect(() => {
    if (!selectedClient?.sellsByRoll) return;
    setRollExitTypes(prev => {
      const next = { ...prev };
      selectedRolls.forEach(r => { next[r.id] = 'EXIT_FULL'; });
      return next;
    });
  }, [selectedClient, selectedRolls]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function clearFilters() {
    setSearch(''); setCategoryFilter(''); setStatusFilter(''); setColorFilter('');
    updateUrl({});
  }

  async function loadWizardRolls() {
    setWizardLoading(true);
    setWizardRolls([]);
    try {
      const res = await fetch('/api/inventory?limit=500');
      const json = await res.json();
      const allRolls: Roll[] = json.data ?? [];
      const available = allRolls
        .filter(r => r.status === 'ACTIVE' || r.status === 'REMNANT')
        .sort((a, b) => {
          if (!a.isRemnant && b.isRemnant) return -1;
          if (a.isRemnant && !b.isRemnant) return 1;
          if (a.isRemnant && b.isRemnant) return a.currentMeters - b.currentMeters;
          return (a.disaNumber ?? a.rollNumber).localeCompare(b.disaNumber ?? b.rollNumber);
        });
      setWizardRolls(available);
    } catch {
      setToast({ message: 'Error al cargar rollos', type: 'error' });
    } finally {
      setWizardLoading(false);
    }
  }

  function openExitFlow(preselectedRoll?: Roll) {
    setShowExit(true);
    setExitStep('roll-select');
    setSelectedRolls(preselectedRoll ? [preselectedRoll] : []);
    setWizardSearch('');
    setExitClient(''); setExitClientName('');
    setExitDiscount(''); setExitNotes('');
    setRollExitTypes({}); setRollMeters({});
    setRollPrices({}); setRollPriceLocked({}); setRollPriceHints({});
    setFetchingPrices(false);
    setSaleResult(null);
    loadWizardRolls();
  }

  function closeExit() {
    setShowExit(false);
    setExitStep('roll-select');
    setWizardRolls([]); setWizardSearch('');
    setSelectedRolls([]);
    setExitClient(''); setExitClientName('');
    setExitDiscount(''); setExitNotes('');
    setRollExitTypes({}); setRollMeters({});
    setRollPrices({}); setRollPriceLocked({}); setRollPriceHints({});
    setFetchingPrices(false);
    setSaleResult(null);
  }

  function toggleRoll(roll: Roll) {
    setSelectedRolls(prev => {
      if (prev.some(r => r.id === roll.id)) return prev.filter(r => r.id !== roll.id);
      return [...prev, roll];
    });
  }

  function removeRoll(rollId: number) {
    setSelectedRolls(prev => prev.filter(r => r.id !== rollId));
    setRollExitTypes(prev => { const n = { ...prev }; delete n[rollId]; return n; });
    setRollMeters(prev => { const n = { ...prev }; delete n[rollId]; return n; });
    setRollPrices(prev => { const n = { ...prev }; delete n[rollId]; return n; });
    setRollPriceLocked(prev => { const n = { ...prev }; delete n[rollId]; return n; });
    setRollPriceHints(prev => { const n = { ...prev }; delete n[rollId]; return n; });
  }

  async function handleExit() {
    if (selectedRolls.length === 0 || !exitClient) return;

    if (isGeneralClient && !exitClientName.trim()) {
      setToast({ message: 'Ingresa el nombre de la persona o empresa', type: 'error' }); return;
    }

    for (const roll of selectedRolls) {
      const et = rollExitTypes[roll.id] ?? 'EXIT_PARTIAL';
      if (et === 'EXIT_PARTIAL') {
        const m = parseFloat(rollMeters[roll.id] || '0');
        if (m <= 0) {
          setToast({ message: `Ingresa metros para rollo ${roll.disaNumber ?? displayRollNumber(roll.rollNumber)}`, type: 'error' }); return;
        }
        if (m > roll.currentMeters) {
          setToast({ message: `Metros exceden disponible en rollo ${roll.disaNumber ?? displayRollNumber(roll.rollNumber)} (máx. ${roll.currentMeters}m)`, type: 'error' }); return;
        }
      }
      const p = parseFloat(rollPrices[roll.id] || '0');
      if (!p || p <= 0) {
        setToast({ message: `Ingresa precio para rollo ${roll.disaNumber ?? displayRollNumber(roll.rollNumber)}`, type: 'error' }); return;
      }
    }

    const discountNum = parseFloat(exitDiscount || '0');
    const rollsPayload = selectedRolls.map(roll => {
      const et = rollExitTypes[roll.id] ?? 'EXIT_PARTIAL';
      return {
        rollId: roll.id,
        exitType: et,
        meters: et === 'EXIT_FULL' ? roll.currentMeters : parseFloat(rollMeters[roll.id] || '0'),
        pricePerMeter: parseFloat(rollPrices[roll.id] || '0'),
      };
    });

    setExitLoading(true);
    try {
      const res = await fetch('/api/inventory/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: parseInt(exitClient),
          clientName: isGeneralClient ? exitClientName.trim() : null,
          discount: discountNum,
          notes: exitNotes || null,
          rolls: rollsPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setToast({ message: data.error ?? 'Error al registrar salida', type: 'error' }); return; }

      setRolls(prev => {
        let updated = [...prev];
        for (const ru of data.rollUpdates ?? []) {
          updated = updated.map(r =>
            r.id === ru.rollId
              ? { ...r, currentMeters: ru.newMeters, status: ru.newStatus, isRemnant: ru.isRemnant }
              : r
          );
        }
        return updated;
      });

      const saleRolls: SaleResultRoll[] = selectedRolls.map((roll, i) => {
        const p = rollsPayload[i];
        return { roll, meters: p.meters, pricePerMeter: p.pricePerMeter, subtotal: p.meters * p.pricePerMeter };
      });

      setSaleResult({
        saleId: data.saleId,
        clientName: data.clientName ?? selectedClient?.name ?? '',
        clientType: data.clientType ?? selectedClient?.type ?? '',
        rolls: saleRolls,
        discount: discountNum,
        subtotal: saleRolls.reduce((s, x) => s + x.subtotal, 0),
        total: data.total,
        registradoPor: userName,
      });
      setExitStep('success');
    } catch {
      setToast({ message: 'Error de conexión', type: 'error' });
    } finally {
      setExitLoading(false);
    }
  }

  function handleDownloadPDF() {
    if (!saleResult) return;
    const now = new Date();
    const colombianNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const fecha = colombianNow.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = colombianNow.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

    generateSalePDF({
      cliente: { nombre: saleResult.clientName },
      rollos: saleResult.rolls.map(item => {
        const isBlackout = isBlackoutProduct(item.roll.category.name);
        return {
          consecutivo: item.roll.disaNumber ?? displayRollNumber(item.roll.rollNumber),
          referencia: formatRef(item.roll.product.code, isBlackout),
          color: rollColor(item.roll),
          ancho: item.roll.product.width,
          metros: item.meters,
          precioMetro: item.pricePerMeter,
          subtotal: item.subtotal,
        };
      }),
      precio: { descuento: saleResult.discount, subtotalGeneral: saleResult.subtotal, total: saleResult.total },
      venta: { fecha, hora, documentId: saleResult.saleId, registradoPor: saleResult.registradoPor },
    });
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
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⊘</span>
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E5E5] rounded text-sm focus:outline-none focus:border-gray-400" autoComplete="off" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Todas</option>
          <option value="Velo">Velo</option>
          <option value="Blackout">Blackout</option>
        </select>
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Color</option>
          {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
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

      {/* ══════════════════════════════════════════════════
          EXIT MODAL — WIZARD MULTI-ROLLO
      ══════════════════════════════════════════════════ */}
      {showExit && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center sm:p-4" onClick={exitStep === 'success' ? undefined : closeExit}>
          <div className="bg-white w-full sm:rounded-xl rounded-t-2xl shadow-2xl sm:max-w-lg max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#F0F0F0]">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {exitStep === 'success' ? 'Venta registrada' : 'Nueva salida'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {exitStep === 'roll-select' && 'Paso 1 — Selecciona los rollos'}
                  {exitStep === 'confirm' && 'Paso 2 — Detalle de la venta'}
                  {exitStep === 'success' && '✓ Completado exitosamente'}
                </p>
              </div>
              <button onClick={closeExit} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5">

              {/* ── PASO 1 — Selección de rollos ── */}
              {exitStep === 'roll-select' && (
                <div className="space-y-4">
                  <input type="text" value={wizardSearch} onChange={e => setWizardSearch(e.target.value)}
                    placeholder="Buscar por consecutivo, referencia..."
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                    autoFocus />

                  {wizardLoading ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Cargando rollos...</div>
                  ) : filteredWizardRolls.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      {wizardRolls.length === 0 ? 'No hay rollos disponibles' : 'Sin resultados para esa búsqueda'}
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto">
                      {/* Completos */}
                      {filteredWizardRolls.some(r => !r.isRemnant) && (
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide px-1 py-1.5 font-medium border-b border-[#F0F0F0] sticky top-0 bg-white">
                          Rollos completos
                        </div>
                      )}
                      {filteredWizardRolls.filter(r => !r.isRemnant).map(r => {
                        const isBlackout = isBlackoutProduct(r.category.name);
                        const ref = formatRef(r.product.code, isBlackout);
                        const color = rollColor(r);
                        const isSelected = selectedRolls.some(s => s.id === r.id);
                        return (
                          <button key={r.id} type="button" onClick={() => toggleRoll(r)}
                            className={`w-full grid grid-cols-12 gap-2 items-center border rounded-lg px-3 py-2.5 text-xs mt-1.5 hover:border-gray-400 hover:bg-gray-50 transition-colors text-left ${isSelected ? 'border-gray-900 bg-gray-50' : 'border-[#E5E5E5]'}`}>
                            <span className={`col-span-1 text-center text-base ${isSelected ? 'text-gray-900' : 'text-gray-200'}`}>✓</span>
                            <span className="col-span-2 font-mono font-bold text-gray-800 truncate">{r.disaNumber ?? '—'}</span>
                            <span className="col-span-3 font-mono font-semibold text-gray-700 truncate">{ref}</span>
                            <span className="col-span-3 text-gray-500 truncate">{color}</span>
                            <span className="col-span-3 text-right font-semibold text-green-700">{r.currentMeters}m</span>
                          </button>
                        );
                      })}

                      {/* Remanentes */}
                      {filteredWizardRolls.some(r => r.isRemnant) && (
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide px-1 py-1.5 font-medium border-b border-[#F0F0F0] sticky top-0 bg-white mt-3">
                          Remanentes
                        </div>
                      )}
                      {filteredWizardRolls.filter(r => r.isRemnant).map(r => {
                        const isBlackout = isBlackoutProduct(r.category.name);
                        const ref = formatRef(r.product.code, isBlackout);
                        const color = rollColor(r);
                        const isSelected = selectedRolls.some(s => s.id === r.id);
                        return (
                          <button key={r.id} type="button" onClick={() => toggleRoll(r)}
                            className={`w-full grid grid-cols-12 gap-2 items-center border rounded-lg px-3 py-2.5 text-xs mt-1.5 hover:border-gray-400 hover:bg-gray-50 transition-colors text-left ${isSelected ? 'border-gray-900 bg-gray-50' : 'border-[#E5E5E5]'}`}>
                            <span className={`col-span-1 text-center text-base ${isSelected ? 'text-gray-900' : 'text-gray-200'}`}>✓</span>
                            <span className="col-span-2 font-mono font-bold text-gray-800 truncate">{r.disaNumber ?? '—'}</span>
                            <span className="col-span-3 font-mono font-semibold text-gray-700 truncate">{ref}</span>
                            <span className="col-span-3 text-gray-500 truncate">{color}</span>
                            <span className="col-span-3 text-right">
                              <span className="font-semibold text-amber-600">{r.currentMeters}m</span>
                              <span className="text-gray-300"> /{r.initialMeters}m</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#F0F0F0]">
                    <span className="text-sm text-gray-500">
                      {selectedRolls.length === 0
                        ? 'Ningún rollo seleccionado'
                        : `${selectedRolls.length} rollo${selectedRolls.length !== 1 ? 's' : ''} seleccionado${selectedRolls.length !== 1 ? 's' : ''}`}
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={closeExit}
                        className="border border-[#E5E5E5] rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                        Cancelar
                      </button>
                      <button type="button"
                        onClick={() => setExitStep('confirm')}
                        disabled={selectedRolls.length === 0}
                        className="bg-[#0A0A0A] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-40">
                        Continuar →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PASO 2 — Detalle de la venta ── */}
              {exitStep === 'confirm' && (
                <div className="space-y-4">

                  {/* Resumen de rollos seleccionados */}
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center justify-between">
                    <span>
                      {selectedRolls.length} rollo{selectedRolls.length !== 1 ? 's' : ''}:{' '}
                      {selectedRolls.map(r => r.disaNumber ?? displayRollNumber(r.rollNumber)).join(', ')}
                    </span>
                    <button type="button" onClick={() => {
                      setRollPrices({}); setRollPriceLocked({}); setRollPriceHints({});
                      setExitStep('roll-select');
                    }} className="text-blue-500 hover:underline ml-2 shrink-0">
                      Modificar
                    </button>
                  </div>

                  {/* Cliente */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                      Cliente <span className="text-red-400">*</span>
                    </label>
                    <ClientCombobox
                      clients={clientsList}
                      value={exitClient}
                      onChange={v => { setExitClient(v); setExitClientName(''); setExitDiscount(''); }}
                      onClientCreated={newC => setClientsList(prev => [...prev, newC].sort((a, b) => a.name.localeCompare(b.name)))}
                      placeholder="Seleccionar o crear cliente..."
                    />
                    {isGeneralClient && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                          Nombre de la persona / empresa <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={exitClientName}
                          onChange={e => setExitClientName(e.target.value)}
                          placeholder="Ej. Carlos Pérez, Decoraciones El Sol..."
                          className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                          autoFocus />
                      </div>
                    )}
                  </div>

                  {/* Loading prices indicator */}
                  {fetchingPrices && (
                    <p className="text-xs text-gray-400 text-center py-1">Cargando precios...</p>
                  )}

                  {/* Per-roll cards */}
                  <div className="space-y-3">
                    {selectedRolls.map(roll => {
                      const isBlackout = isBlackoutProduct(roll.category.name);
                      const ref = formatRef(roll.product.code, isBlackout);
                      const color = rollColor(roll);
                      const et = rollExitTypes[roll.id] ?? 'EXIT_PARTIAL';
                      const locked = rollPriceLocked[roll.id] ?? false;
                      const hint = rollPriceHints[roll.id] ?? '';
                      const price = rollPrices[roll.id] ?? '';
                      const metersForCalc = et === 'EXIT_FULL'
                        ? roll.currentMeters
                        : parseFloat(rollMeters[roll.id] || '0');
                      const rowSubtotal = metersForCalc * parseFloat(price || '0');
                      const forceFull = selectedClient?.sellsByRoll;

                      return (
                        <div key={roll.id} className="border border-[#E5E5E5] rounded-lg p-3 space-y-2.5">
                          {/* Roll header */}
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-mono font-bold text-sm text-gray-900">
                                {roll.disaNumber ?? displayRollNumber(roll.rollNumber)}
                              </span>
                              <span className="text-xs text-gray-400 ml-2">
                                {ref} · {color} · {roll.product.width}cm
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-semibold ${roll.isRemnant ? 'text-amber-600' : 'text-green-700'}`}>
                                {roll.currentMeters}m disp.
                              </span>
                              <button type="button" onClick={() => removeRoll(roll.id)}
                                className="text-gray-300 hover:text-red-400 text-sm transition-colors" title="Quitar rollo">
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Metros + precio */}
                          {forceFull ? (
                            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                              Venta por rollo completo · {roll.currentMeters} m
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {/* Metros */}
                              <div>
                                <div className="flex gap-1 mb-1">
                                  {(['EXIT_PARTIAL', 'EXIT_FULL'] as const).map(t => (
                                    <button key={t} type="button"
                                      onClick={() => setRollExitTypes(prev => ({ ...prev, [roll.id]: t }))}
                                      className={`flex-1 text-[10px] border rounded px-1 py-1 transition-colors ${et === t ? 'border-gray-800 bg-gray-100 font-medium' : 'border-[#E5E5E5] text-gray-500 hover:border-gray-300'}`}>
                                      {t === 'EXIT_PARTIAL' ? 'Parcial' : 'Completo'}
                                    </button>
                                  ))}
                                </div>
                                {et === 'EXIT_PARTIAL' ? (
                                  <input type="number" step="0.1" min="0.1" max={roll.currentMeters}
                                    value={rollMeters[roll.id] ?? ''}
                                    onChange={e => setRollMeters(prev => ({ ...prev, [roll.id]: e.target.value }))}
                                    placeholder={`Máx. ${roll.currentMeters} m`}
                                    className="w-full border border-[#E5E5E5] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
                                ) : (
                                  <div className="text-xs text-gray-500 bg-gray-50 border border-[#E5E5E5] rounded px-2 py-1.5">
                                    {roll.currentMeters} m (todo)
                                  </div>
                                )}
                              </div>

                              {/* Precio/m */}
                              <div>
                                <div className="text-[10px] text-gray-500 mb-1">Precio/m <span className="text-red-400">*</span></div>
                                <div className="relative">
                                  <input type="number" step="100" min="1"
                                    value={price}
                                    onChange={e => { if (!locked) setRollPrices(prev => ({ ...prev, [roll.id]: e.target.value })); }}
                                    readOnly={locked}
                                    className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none ${locked ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-[#E5E5E5] focus:border-gray-400'}`}
                                    placeholder="Ej. 25000" />
                                  {locked && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔒</span>
                                  )}
                                </div>
                                {hint && !fetchingPrices && (
                                  <p className={`text-[10px] mt-0.5 ${hint.startsWith('Sin') ? 'text-amber-600' : 'text-blue-500'}`}>{hint}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Row subtotal */}
                          {rowSubtotal > 0 && (
                            <div className="text-xs text-right text-gray-400">
                              Subtotal: <span className="font-semibold text-gray-700">{formatCOP(rowSubtotal)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Descuento */}
                  {canManage && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                        Descuento (%)
                      </label>
                      <input type="number" step="0.5" min="0" max="100" value={exitDiscount}
                        onChange={e => setExitDiscount(e.target.value)}
                        className="w-full border border-[#E5E5E5] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                        placeholder="0" />
                    </div>
                  )}

                  {/* Resumen en tiempo real */}
                  {exitCalc.subtotalGeneral > 0 && (
                    <div className="bg-gray-50 border border-[#E5E5E5] rounded-lg px-4 py-3 text-sm space-y-1.5">
                      {exitCalc.disc > 0 && (
                        <>
                          <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span className="tabular-nums">{formatCOP(exitCalc.subtotalGeneral)}</span>
                          </div>
                          <div className="flex justify-between text-red-500">
                            <span>Descuento ({exitCalc.disc}%)</span>
                            <span className="tabular-nums">–{formatCOP(exitCalc.discountAmount)}</span>
                          </div>
                        </>
                      )}
                      <div className="border-t border-[#E5E5E5] pt-2 flex justify-between font-bold text-gray-900 text-base">
                        <span>TOTAL</span>
                        <span className="tabular-nums">{formatCOP(exitCalc.total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Notas */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">Notas</label>
                    <textarea value={exitNotes} onChange={e => setExitNotes(e.target.value)} rows={2}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-gray-400"
                      placeholder="Observaciones opcionales..." />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button type="button"
                      onClick={() => {
                        setRollPrices({}); setRollPriceLocked({}); setRollPriceHints({});
                        setExitStep('roll-select');
                      }}
                      className="border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                      ← Volver
                    </button>
                    <button type="button" onClick={handleExit}
                      disabled={exitLoading || !exitClient || selectedRolls.length === 0}
                      className="flex-1 bg-green-600 text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                      {exitLoading
                        ? 'Registrando...'
                        : `Confirmar venta${selectedRolls.length > 1 ? ` (${selectedRolls.length} rollos)` : ''}`}
                    </button>
                  </div>
                </div>
              )}

              {/* ── PASO 3 — Éxito ── */}
              {exitStep === 'success' && saleResult && (
                <div className="space-y-5">
                  <div className="text-center py-2">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-2xl">✓</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900">Venta registrada</p>
                    <p className="text-sm text-gray-400 mt-1">Venta N°{saleResult.saleId}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cliente</span>
                      <span className="font-medium text-gray-900">{saleResult.clientName}</span>
                    </div>
                    <div className="border-t border-[#E5E5E5] pt-2 space-y-1.5">
                      {saleResult.rolls.map(item => {
                        const isBlackout = isBlackoutProduct(item.roll.category.name);
                        const ref = formatRef(item.roll.product.code, isBlackout);
                        return (
                          <div key={item.roll.id} className="flex justify-between text-xs text-gray-500">
                            <span className="truncate mr-2">
                              {item.roll.disaNumber ?? displayRollNumber(item.roll.rollNumber)} · {ref} · {item.meters}m
                            </span>
                            <span className="tabular-nums shrink-0">{formatCOP(item.subtotal)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {saleResult.discount > 0 && (
                      <div className="flex justify-between text-xs text-red-500">
                        <span>Descuento ({saleResult.discount}%)</span>
                        <span className="tabular-nums">–{formatCOP(saleResult.subtotal - saleResult.total)}</span>
                      </div>
                    )}
                    <div className="border-t border-[#E5E5E5] pt-2 flex justify-between font-bold text-gray-900 text-base">
                      <span>TOTAL</span>
                      <span className="tabular-nums">{formatCOP(saleResult.total)}</span>
                    </div>
                  </div>

                  <button type="button" onClick={handleDownloadPDF}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-medium hover:bg-blue-700 transition-colors">
                    📄 Descargar tirilla
                  </button>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => {
                      setSaleResult(null);
                      setExitStep('roll-select');
                      setSelectedRolls([]);
                      setExitClient(''); setExitClientName('');
                      setExitDiscount(''); setExitNotes('');
                      setRollExitTypes({}); setRollMeters({});
                      setRollPrices({}); setRollPriceLocked({}); setRollPriceHints({});
                      loadWizardRolls();
                    }}
                      className="flex-1 border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                      Otra salida
                    </button>
                    <button type="button" onClick={closeExit}
                      className="flex-1 bg-[#0A0A0A] text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-[#1A1A1A]">
                      Cerrar
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
