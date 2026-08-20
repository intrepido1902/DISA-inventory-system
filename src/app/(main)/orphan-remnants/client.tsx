'use client';

import { useState } from 'react';
import { formatColombianDate } from '@/lib/dateUtils';

interface OrphanRemnant {
  id: number;
  reference: string;
  color: string;
  estimatedMeters: number;
  width: number;
  location: string;
  notes: string | null;
  status: string;
  createdBy: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Props {
  items: OrphanRemnant[];
  canEdit: boolean;   // OWNER or ADMIN
  isOwner: boolean;   // OWNER only
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponible',
  SOLD:      'Vendido',
  DISCARDED: 'Descartado',
};
const STATUS_CLASS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  SOLD:      'bg-blue-100 text-blue-700',
  DISCARDED: 'bg-gray-100 text-gray-500',
};

const BLANK_FORM = {
  reference: '', color: '', estimatedMeters: '', width: '', location: '', notes: '',
};

export default function OrphanRemnantsClient({ items: initial, canEdit, isOwner }: Props) {
  const [items, setItems]             = useState<OrphanRemnant[]>(initial);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(BLANK_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [editId, setEditId]           = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  const visible = statusFilter ? items.filter(r => r.status === statusFilter) : items;

  // ── Create / Update ────────────────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm(BLANK_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(item: OrphanRemnant) {
    setEditId(item.id);
    setForm({
      reference:       item.reference,
      color:           item.color,
      estimatedMeters: String(item.estimatedMeters),
      width:           String(item.width),
      location:        item.location,
      notes:           item.notes ?? '',
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    const payload = {
      reference:       form.reference.trim(),
      color:           form.color.trim(),
      estimatedMeters: parseFloat(form.estimatedMeters),
      width:           parseInt(form.width) || 0,
      location:        form.location.trim(),
      notes:           form.notes.trim() || undefined,
    };

    if (!payload.reference) { setFormError('Referencia es requerida'); setFormLoading(false); return; }
    if (!payload.estimatedMeters || payload.estimatedMeters <= 0) {
      setFormError('Metros deben ser mayores a 0'); setFormLoading(false); return;
    }

    try {
      if (editId !== null) {
        // Update
        const res = await fetch(`/api/orphan-remnants/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) { setFormError(json.error ?? 'Error'); setFormLoading(false); return; }
        setItems(prev => prev.map(r => r.id === editId
          ? { ...r, ...payload, notes: payload.notes ?? null, updatedAt: Date.now() }
          : r,
        ));
      } else {
        // Create
        const res = await fetch('/api/orphan-remnants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) { setFormError(json.error ?? 'Error'); setFormLoading(false); return; }
        const now = Date.now();
        const newItem: OrphanRemnant = {
          id:              json.id,
          status:          'AVAILABLE',
          createdBy:       null,
          createdAt:       now,
          updatedAt:       now,
          notes:           payload.notes ?? null,
          reference:       payload.reference,
          color:           payload.color,
          estimatedMeters: payload.estimatedMeters,
          width:           payload.width,
          location:        payload.location,
        };
        setItems(prev => [newItem, ...prev]);
      }
      setShowForm(false);
    } catch {
      setFormError('Error de conexión');
    } finally {
      setFormLoading(false);
    }
  }

  // ── Status change ──────────────────────────────────────────────────────────
  async function handleStatusChange(id: number, newStatus: string) {
    const res = await fetch(`/api/orphan-remnants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setItems(prev => prev.map(r => r.id === id ? { ...r, status: newStatus, updatedAt: Date.now() } : r));
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este remanente huérfano? Esta acción no se puede deshacer.')) return;
    setDeletingId(id);
    const res = await fetch(`/api/orphan-remnants/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems(prev => prev.filter(r => r.id !== id));
    }
    setDeletingId(null);
  }

  const available = items.filter(r => r.status === 'AVAILABLE');
  const totalAvailableMeters = available.reduce((sum, r) => sum + r.estimatedMeters, 0);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Remanentes huérfanos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Retazos fuera del sistema de rollos
            {available.length > 0 && (
              <> · <span className="font-medium text-gray-700">
                {available.length} disponible{available.length !== 1 ? 's' : ''} ·{' '}
                ~{Number(totalAvailableMeters).toLocaleString('es-CO', { maximumFractionDigits: 1 })} m
              </span></>
            )}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            + Registrar
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {['', 'AVAILABLE', 'SOLD', 'DISCARDED'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              statusFilter === s
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-[#E5E5E5] hover:bg-gray-50'
            }`}
          >
            {s === '' ? 'Todos' : STATUS_LABEL[s]}
            <span className="ml-1.5 opacity-60">
              {s === '' ? items.length : items.filter(r => r.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {/* Form modal */}
      {showForm && canEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-base">
                {editId !== null ? 'Editar remanente' : 'Registrar remanente huérfano'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <Field label="Referencia *" >
                <input
                  type="text" value={form.reference} required autoFocus
                  placeholder="ej. 2237 o LSFH2306-1"
                  onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  className="input-base"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Color">
                  <input type="text" value={form.color}
                    placeholder="ej. Blanco"
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="input-base" />
                </Field>
                <Field label="Ancho (cm)">
                  <input type="number" value={form.width} min="0"
                    placeholder="ej. 300"
                    onChange={e => setForm(f => ({ ...f, width: e.target.value }))}
                    className="input-base" />
                </Field>
              </div>
              <Field label="Metros estimados *">
                <input type="number" value={form.estimatedMeters} min="0.1" step="0.1" required
                  placeholder="ej. 12.5"
                  onChange={e => setForm(f => ({ ...f, estimatedMeters: e.target.value }))}
                  className="input-base" />
              </Field>
              <Field label="Ubicación / Bodega">
                <input type="text" value={form.location}
                  placeholder="ej. Estante 3"
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="input-base" />
              </Field>
              <Field label="Notas">
                <textarea value={form.notes} rows={2}
                  placeholder="Observaciones opcionales..."
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-base resize-none" />
              </Field>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-[#E5E5E5] text-gray-600 rounded py-2 text-sm hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={formLoading}
                  className="flex-1 bg-gray-900 text-white rounded py-2 text-sm hover:bg-gray-700 transition-colors disabled:opacity-50">
                  {formLoading ? 'Guardando…' : editId !== null ? 'Guardar cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {statusFilter ? `No hay remanentes con estado "${STATUS_LABEL[statusFilter]}".` : 'No hay remanentes huérfanos registrados.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="px-4 py-3 text-left">Referencia</th>
                  <th className="px-4 py-3 text-left">Color</th>
                  <th className="px-4 py-3 text-right">Metros ~</th>
                  <th className="px-4 py-3 text-right">Ancho</th>
                  <th className="px-4 py-3 text-left">Ubicación</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Registrado</th>
                  {canEdit && <th className="px-4 py-3 text-left">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} className="border-b border-[#F0F0F0] hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 text-xs">{r.reference}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.color || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-medium">
                      {Number(r.estimatedMeters).toLocaleString('es-CO', { maximumFractionDigits: 1 })} m
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {r.width > 0 ? `${r.width} cm` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.location || '—'}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select
                          value={r.status}
                          onChange={e => handleStatusChange(r.id, e.target.value)}
                          className={`text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer ${STATUS_CLASS[r.status] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          <option value="AVAILABLE">Disponible</option>
                          <option value="SOLD">Vendido</option>
                          <option value="DISCARDED">Descartado</option>
                        </select>
                      ) : (
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${STATUS_CLASS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {formatColombianDate(r.createdAt)}
                      {r.notes && (
                        <div className="text-gray-400 mt-0.5 truncate max-w-36" title={r.notes}>{r.notes}</div>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs text-gray-500 hover:text-gray-900 border border-[#E5E5E5] rounded px-2 py-0.5 hover:bg-gray-50 transition-colors"
                          >
                            Editar
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={deletingId === r.id}
                              className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              {deletingId === r.id ? '…' : 'Eliminar'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .input-base {
          width: 100%;
          border: 1px solid #E5E5E5;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-base:focus {
          border-color: #9CA3AF;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1 font-medium">{label}</label>
      {children}
    </div>
  );
}
