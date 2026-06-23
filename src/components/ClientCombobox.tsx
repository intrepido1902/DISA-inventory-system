'use client';

import { useState, useRef, useEffect } from 'react';

export interface ComboClient {
  id: number;
  name: string;
  type: string;
  pricePerMeter?: number | null;
  sellsByRoll?: boolean;
}

interface ClientComboboxProps {
  clients: ComboClient[];
  value: string;
  onChange: (id: string) => void;
  onClientCreated: (client: ComboClient) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Reference base (e.g. "2306") used when creating a new DISTRIBUTOR client
   *  to prompt for a per-ref price and store it in ClientPrice. */
  productRef?: string;
}

const TYPE_LABEL: Record<string, string> = {
  DISTRIBUTOR: 'Fijo',
  DECORATOR: 'Ocasional',
  FIXED: 'Fijo',
  OCCASIONAL: 'Ocasional',
  GENERAL: 'General',
};

export default function ClientCombobox({
  clients,
  value,
  onChange,
  onClientCreated,
  placeholder = 'Seleccionar cliente',
  disabled = false,
  productRef,
}: ClientComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'DISTRIBUTOR' | 'DECORATOR'>('DISTRIBUTOR');
  const [newPhone, setNewPhone] = useState('');
  const [newSellsByRoll, setNewSellsByRoll] = useState(false);
  const [newPriceForRef, setNewPriceForRef] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedClient = clients.find(c => String(c.id) === value);

  const filtered = search.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  const trimmedSearch = search.trim();
  const exactMatch = clients.some(c => c.name.toLowerCase() === trimmedSearch.toLowerCase());
  const showCreateOption = trimmedSearch.length > 0 && !exactMatch;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false); setSearch(''); setShowCreate(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (isOpen && !showCreate) setTimeout(() => searchInputRef.current?.focus(), 40);
    if (showCreate) setTimeout(() => nameInputRef.current?.focus(), 40);
  }, [isOpen, showCreate]);

  function open() {
    if (disabled) return;
    setSearch(''); setShowCreate(false); setIsOpen(true);
  }

  function close() {
    setIsOpen(false); setSearch(''); setShowCreate(false); resetCreateForm();
  }

  function resetCreateForm() {
    setNewName(''); setNewType('DISTRIBUTOR'); setNewPhone('');
    setNewSellsByRoll(false); setNewPriceForRef(''); setCreateError(''); setCreating(false);
  }

  function handleSelect(c: ComboClient) {
    onChange(String(c.id)); close();
  }

  function handleStartCreate() {
    setNewName(trimmedSearch); setCreateError(''); setShowCreate(true);
  }

  async function handleCreate() {
    if (!newName.trim()) { setCreateError('El nombre es requerido'); return; }
    setCreating(true); setCreateError('');
    try {
      // 1. Create the client
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          phone: newPhone.trim() || null,
          sellsByRoll: newType === 'DISTRIBUTOR' ? newSellsByRoll : false,
          pricePerMeter: null, // prices now live in ClientPrice per-ref
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? 'Error al crear cliente'); return; }

      // 2. If DISTRIBUTOR + productRef + price entered: also create the per-ref price
      if (newType === 'DISTRIBUTOR' && productRef && newPriceForRef && parseFloat(newPriceForRef) > 0) {
        await fetch(`/api/clients/${data.id}/prices`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productRef, pricePerMeter: parseFloat(newPriceForRef) }),
        });
      }

      const newClient: ComboClient = {
        id: data.id,
        name: data.name,
        type: data.type,
        pricePerMeter: data.pricePerMeter ?? null,
        sellsByRoll: Boolean(data.sellsByRoll),
      };
      onClientCreated(newClient);
      onChange(String(newClient.id));
      close();
    } catch {
      setCreateError('Error de conexión');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button" onClick={open} disabled={disabled}
        className="w-full flex items-center justify-between border border-[#E5E5E5] rounded px-3 py-2.5 text-sm text-left bg-white focus:outline-none focus:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-300 transition-colors"
      >
        <span className={selectedClient ? 'text-gray-900' : 'text-gray-400'}>
          {selectedClient
            ? `${selectedClient.name} (${TYPE_LABEL[selectedClient.type] ?? selectedClient.type})`
            : placeholder}
        </span>
        <span className="text-gray-400 ml-2 flex-shrink-0">▾</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E5E5E5] rounded-lg shadow-xl z-[60] flex flex-col overflow-hidden">
          {!showCreate ? (
            <>
              <div className="p-2 border-b border-[#E5E5E5] flex-shrink-0">
                <input ref={searchInputRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded focus:outline-none focus:border-gray-400" />
              </div>
              <div className="overflow-y-auto max-h-48">
                {filtered.length === 0 && !showCreateOption && (
                  <p className="px-4 py-3 text-sm text-gray-400 text-center">No hay resultados</p>
                )}
                {filtered.map(c => (
                  <button key={c.id} type="button" onClick={() => handleSelect(c)}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 min-h-[44px] flex flex-col justify-center transition-colors ${String(c.id) === value ? 'bg-gray-50' : ''}`}>
                    <span className="font-medium text-gray-900 leading-tight">{c.name}</span>
                    <span className="text-xs text-gray-400">
                      {TYPE_LABEL[c.type] ?? c.type}
                      {c.type === 'DISTRIBUTOR' && c.sellsByRoll ? ' · por rollo' : ''}
                    </span>
                  </button>
                ))}
                {showCreateOption && (
                  <button type="button" onClick={handleStartCreate}
                    className="w-full text-left px-4 py-3 text-sm text-blue-600 hover:bg-blue-50 min-h-[44px] flex items-center gap-2 border-t border-[#E5E5E5] transition-colors">
                    <span className="font-bold text-base leading-none">+</span>
                    <span>Crear &ldquo;<span className="font-semibold">{trimmedSearch}</span>&rdquo;</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">Nuevo cliente</p>
                <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre <span className="text-red-400">*</span></label>
                  <input ref={nameInputRef} type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select value={newType} onChange={e => { setNewType(e.target.value as 'DISTRIBUTOR' | 'DECORATOR'); setNewSellsByRoll(false); }}
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
                    <option value="DISTRIBUTOR">Fijo (precio acordado)</option>
                    <option value="DECORATOR">Ocasional</option>
                  </select>
                </div>
                {newType === 'DISTRIBUTOR' && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={newSellsByRoll} onChange={e => setNewSellsByRoll(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300" />
                      <span className="text-xs text-gray-700">Vende por rollo completo</span>
                    </label>
                    {productRef && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Precio para ref. <span className="font-mono">{productRef}</span> <span className="text-gray-400 font-normal">(opcional)</span>
                        </label>
                        <input type="number" step="100" min="1" value={newPriceForRef}
                          onChange={e => setNewPriceForRef(e.target.value)}
                          className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                          placeholder="Ej. 38000" />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                    placeholder="300 000 0000" />
                </div>
                {createError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-1.5">{createError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="flex-1 border border-[#E5E5E5] rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    ← Volver
                  </button>
                  <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()}
                    className="flex-1 bg-[#0A0A0A] text-white rounded px-3 py-2 text-sm font-medium hover:bg-[#1A1A1A] disabled:opacity-50 transition-colors">
                    {creating ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
