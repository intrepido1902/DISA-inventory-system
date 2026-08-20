'use client';

import { useState } from 'react';
import { generateRollLabel } from '@/lib/generateRollLabel';
import { generateReturnPDF } from '@/lib/generateReturnPDF';

interface ReturnResult {
  metersReturned: number;
  newMeters: number;
  newStatus: string;
  roll: {
    consecutivo: string;
    referencia: string;
    color: string;
    anchoStr: string;
    metrosIniciales: number;
  };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  REMNANT: 'Remanente',
  DEPLETED: 'Agotado',
  WRITTEN_OFF: 'Dado de baja',
};

export default function ReturnButton({
  rollId,
  initialMeters,
  currentMeters,
  consecutivo,
  referencia,
  color,
  anchoStr,
  estado,
}: {
  rollId: number;
  initialMeters: number;
  currentMeters: number;
  consecutivo: string;
  referencia: string;
  color: string;
  anchoStr: string;
  estado: string;
}) {
  const [open, setOpen] = useState(false);
  const [meters, setMeters] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnResult | null>(null);

  const maxReturnable = initialMeters - currentMeters;

  function openModal() {
    setOpen(true);
    setMeters('');
    setNotes('');
    setError('');
    setResult(null);
  }

  function closeModal() {
    if (result) {
      // Reload page so roll data reflects new meters
      window.location.reload();
    }
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const m = parseFloat(meters);
    if (isNaN(m) || m <= 0) { setError('Ingresa metros válidos'); return; }
    if (m > maxReturnable)  { setError(`Máximo: ${maxReturnable} m`); return; }
    if (!notes.trim())      { setError('Las notas son obligatorias'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/inventory/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollId, meters: m, notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al registrar'); return; }
      setResult(data);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  function printLabel() {
    if (!result) return;
    const today = new Date().toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
    });
    generateRollLabel({
      consecutivo: result.roll.consecutivo,
      referencia: result.roll.referencia,
      color: result.roll.color,
      anchoStr: result.roll.anchoStr,
      metrosActuales: result.newMeters,
      metrosIniciales: result.roll.metrosIniciales,
      estado: STATUS_LABEL[result.newStatus] ?? result.newStatus,
      actualizadoEn: today,
    });
  }

  function printReturn() {
    if (!result) return;
    const now = new Date();
    const colombianNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const fecha = colombianNow.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora  = colombianNow.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    generateReturnPDF({
      consecutivo: result.roll.consecutivo,
      referencia: result.roll.referencia,
      color: result.roll.color,
      anchoStr: result.roll.anchoStr,
      metrosDevueltos: result.metersReturned,
      metrosNuevos: result.newMeters,
      metrosIniciales: result.roll.metrosIniciales,
      razon: notes,
      fecha,
      hora,
      registradoPor: '',
    });
  }

  if (maxReturnable <= 0) return null; // Roll is already at full meters — nothing to return

  return (
    <>
      <button
        onClick={openModal}
        className="text-xs border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded transition-colors font-medium"
      >
        ↩ Re-ingresar / Devolución
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            {!result ? (
              /* ── Form ── */
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Re-ingreso / Devolución</h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 space-y-0.5">
                  <div><span className="font-medium">Rollo:</span> {consecutivo} — {referencia}</div>
                  <div><span className="font-medium">Color:</span> {color} · <span className="font-medium">Ancho:</span> {anchoStr}</div>
                  <div><span className="font-medium">Metros actuales:</span> {currentMeters} m / {initialMeters} m</div>
                  <div className="text-green-700 font-medium">Máximo a devolver: {maxReturnable} m</div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Metros a devolver <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      max={maxReturnable}
                      step="0.01"
                      value={meters}
                      onChange={e => setMeters(e.target.value)}
                      placeholder={`Máx. ${maxReturnable} m`}
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Motivo / Notas <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Describe el motivo de la devolución..."
                      className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400 resize-none"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={closeModal} disabled={loading}
                      className="flex-1 border border-[#E5E5E5] text-gray-600 text-sm py-2 rounded hover:bg-gray-50 transition-colors disabled:opacity-50">
                      Cancelar
                    </button>
                    <button type="submit" disabled={loading}
                      className="flex-1 bg-green-700 text-white text-sm py-2 rounded hover:bg-green-800 transition-colors disabled:opacity-50 font-medium">
                      {loading ? 'Guardando…' : 'Confirmar devolución'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* ── Success ── */
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Devolución registrada ✓</h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>

                <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 space-y-0.5">
                  <div className="font-semibold">
                    +{result.metersReturned} m devueltos al rollo {result.roll.consecutivo}
                  </div>
                  <div>Metros nuevos: <span className="font-medium">{result.newMeters} m</span> / {result.roll.metrosIniciales} m</div>
                  <div>Estado: <span className="font-medium">{STATUS_LABEL[result.newStatus] ?? result.newStatus}</span></div>
                </div>

                <div className="space-y-2">
                  <button onClick={printLabel}
                    className="w-full flex items-center justify-center gap-2 border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 text-sm py-2.5 rounded font-medium transition-colors">
                    🏷️ Imprimir tirilla del rollo
                  </button>
                  <button onClick={printReturn}
                    className="w-full flex items-center justify-center gap-2 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 text-sm py-2.5 rounded font-medium transition-colors">
                    📄 Imprimir nota de devolución
                  </button>
                  <button onClick={closeModal}
                    className="w-full border border-[#E5E5E5] text-gray-600 text-sm py-2 rounded hover:bg-gray-50 transition-colors">
                    Cerrar y actualizar página
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
