'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TYPE_OPTIONS = [
  { value: 'WRITE_OFF', label: 'Baja total', desc: 'El rollo se retira definitivamente del inventario.' },
  { value: 'DEFECT_DISCOUNT', label: 'Defecto con descuento', desc: 'El rollo tiene defectos pero se venderá con descuento.' },
  { value: 'DEFECT_REPLACEMENT', label: 'Defecto con reposición', desc: 'El rollo será devuelto al proveedor para reposición.' },
] as const;

type DefectType = typeof TYPE_OPTIONS[number]['value'];

export default function DefectButton({
  rollId,
  rollLabel,
  currentDefect,
  hasPendingWriteOff = false,
  userRole,
}: {
  rollId: number;
  rollLabel: string;
  currentDefect: { note: string | null; pct: number | null } | null;
  hasPendingWriteOff?: boolean;
  userRole: string;
}) {
  const autoApprove = userRole === 'OWNER' || userRole === 'ADMIN';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmedPendingWarning, setConfirmedPendingWarning] = useState(false);
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [type, setType] = useState<DefectType>('WRITE_OFF');
  const [notes, setNotes] = useState('');
  const [defectDiscountPct, setDefectDiscountPct] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setType('WRITE_OFF'); setNotes(''); setDefectDiscountPct(''); setError('');
  }

  function handleOpen() {
    setConfirmedPendingWarning(false);
    setConfirmedReplace(false);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setConfirmedPendingWarning(false);
    setConfirmedReplace(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) {
      setError('Las notas son obligatorias'); return;
    }
    if (type === 'DEFECT_DISCOUNT' && (!defectDiscountPct || parseFloat(defectDiscountPct) <= 0)) {
      setError('Ingresa el % de descuento para el defecto'); return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/inventory/defect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollId, type, notes,
          defectDiscountPct: type === 'DEFECT_DISCOUNT' ? parseFloat(defectDiscountPct) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al reportar'); return; }
      handleClose(); router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded px-2 py-1 transition-colors whitespace-nowrap"
      >
        ⚠ Dar de baja
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Dar de baja / Defecto</h2>
                <p className="text-xs text-gray-400 mt-0.5">{rollLabel}</p>
              </div>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4">✕</button>
            </div>

            {/* Step 1: warn if there is already a pending write-off */}
            {hasPendingWriteOff && !confirmedPendingWarning ? (
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide mb-1.5">Baja pendiente de aprobación</p>
                  <p className="text-sm text-orange-700">
                    Este rollo ya tiene una solicitud de baja pendiente. Si continúas, crearás una segunda solicitud que el socio deberá revisar.
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 border border-[#E5E5E5] rounded px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmedPendingWarning(true)}
                    className="flex-1 bg-orange-600 text-white rounded px-3 py-2.5 text-sm font-medium hover:bg-orange-700 transition-colors"
                  >
                    Continuar de todas formas
                  </button>
                </div>
              </div>

            ) : currentDefect && !confirmedReplace ? (
              /* Step 2: warn if there is an approved active defect */
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide mb-1.5">Defecto activo</p>
                  {currentDefect.pct !== null && (
                    <p className="text-sm text-orange-900 font-medium">{currentDefect.pct}% de descuento sugerido</p>
                  )}
                  {currentDefect.note && (
                    <p className="text-xs text-orange-700 mt-1 italic">{currentDefect.note}</p>
                  )}
                </div>
                <p className="text-sm text-gray-700">
                  Este rollo ya tiene un defecto aprobado. Reportar uno nuevo <span className="font-semibold">reemplazará</span> la nota y el % de descuento actuales al aprobarse.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 border border-[#E5E5E5] rounded px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmedReplace(true)}
                    className="flex-1 bg-red-600 text-white rounded px-3 py-2.5 text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Sí, reemplazar
                  </button>
                </div>
              </div>

            ) : (
              /* Main form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">Tipo de baja</label>
                  {TYPE_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${type === opt.value ? 'border-red-300 bg-red-50' : 'border-[#E5E5E5] hover:border-gray-300'}`}>
                      <input
                        type="radio" name="defectType" value={opt.value}
                        checked={type === opt.value}
                        onChange={() => { setType(opt.value); setDefectDiscountPct(''); }}
                        className="mt-0.5 accent-red-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {type === 'DEFECT_DISCOUNT' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                      % de descuento sugerido <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number" step="0.5" min="1" max="100"
                      value={defectDiscountPct}
                      onChange={e => setDefectDiscountPct(e.target.value)}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                      placeholder="Ej. 20"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                    Notas <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400 resize-none"
                    placeholder="Describe el defecto o motivo de baja..."
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>
                )}

                {autoApprove ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-800">
                      ⚠ Esta baja se aplicará <strong>de inmediato</strong>, sin pasar por aprobación.
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-800">
                      ⚠ Esta baja quedará <strong>pendiente de aprobación</strong> del socio. El rollo no se modificará hasta que sea aprobada.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={handleClose}
                    className="flex-1 border border-[#E5E5E5] rounded px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 bg-red-600 text-white rounded px-3 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {loading ? 'Enviando...' : autoApprove ? 'Confirmar baja' : 'Enviar para aprobación'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
