'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatColombianDate } from '@/lib/dateUtils';
import { ACTION_LABELS, ACTION_COLORS, formatAuditData } from '@/lib/auditLabels';
import { generateSalePDF, type SalePDFData } from '@/lib/generateSalePDF';
import { generateRollLabel } from '@/lib/generateRollLabel';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';

interface AuditLog {
  id: number; action: string; entity: string; entityId: number;
  oldData: string | null; newData: string | null; createdAt: number;
  userName: string; userEmail: string;
  // TAREA: Cliente + Valor total for EXIT_FULL/EXIT_PARTIAL rows (joined server-side via
  // enrichAuditLogs — see src/lib/auditEnrich.ts), plus whether the underlying Movement
  // has since been anulado (voided).
  clientName?: string | null;
  saleTotal?: number | null;
  voided?: boolean;
}
interface User { id: number; name: string }

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function isExitAction(action: string): boolean {
  return action === 'EXIT_FULL' || action === 'EXIT_PARTIAL';
}

// ── Reprint helpers ───────────────────────────────────────────────────────────
const STATUS_LBL: Record<string, string> = {
  ACTIVE: 'Activo', REMNANT: 'Remanente', DEPLETED: 'Agotado',
  DEFECTIVE: 'Defectuoso', WRITTEN_OFF: 'Dado de baja',
};

function buildFormatRef(code: string, isBlackout: boolean): string {
  const parts = code.split('-');
  return isBlackout ? `${parts[0]}-${parts[1] ?? ''}` : parts[0];
}

function buildColor(color: string, categoryName: string): string {
  return isBlackoutProduct(categoryName) ? getBlackoutColorName(color) : color;
}

function displayRollNumber(rollNumber: string): string {
  const n = parseInt(rollNumber, 10);
  return isNaN(n) ? rollNumber : String(n);
}

interface ReprintState { loading: boolean; error: string | null }

function ReprintButtons({ log, isOwner }: { log: AuditLog; isOwner: boolean }) {
  const [state, setState] = useState<ReprintState>({ loading: false, error: null });

  if (log.action !== 'EXIT_FULL' && log.action !== 'EXIT_PARTIAL') return null;
  // entityId is the rollId for EXIT actions
  const rollId    = log.entityId;
  const createdAt = log.createdAt;

  async function fetchReprintData() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch(`/api/audit/reprint?rollId=${rollId}&createdAt=${createdAt}`);
      if (!res.ok) {
        const j = await res.json();
        setState({ loading: false, error: j.error ?? 'Error' });
        return null;
      }
      const data = await res.json();
      setState({ loading: false, error: null });
      return data;
    } catch {
      setState({ loading: false, error: 'Error de conexión' });
      return null;
    }
  }

  async function handleFactura() {
    const data = await fetchReprintData();
    if (!data) return;
    const { sale, movements } = data;

    const saleDate = new Date(sale.createdAt);
    const colombianDate = new Date(saleDate.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const fecha = colombianDate.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora  = colombianDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

    const pdfData: SalePDFData = {
      cliente: { nombre: sale.clientName },
      rollos: movements.map((m: any) => {
        const isBlackout = isBlackoutProduct(m.roll.product.category.name);
        const subtotal = m.meters * m.pricePerMeter;
        return {
          consecutivo: m.roll.disaNumber ?? displayRollNumber(m.roll.rollNumber),
          referencia:  buildFormatRef(m.roll.product.code, isBlackout),
          color:       buildColor(m.roll.product.color, m.roll.product.category.name),
          ancho:       m.roll.product.width,
          metros:      m.meters,
          precioMetro: m.pricePerMeter,
          subtotal,
        };
      }),
      precio: {
        descuento:        sale.discount,
        subtotalGeneral:  sale.subtotal,
        total:            sale.total,
      },
      venta: { fecha, hora, documentId: sale.saleId, registradoPor: log.userName },
    };
    generateSalePDF(pdfData);
  }

  async function handleEtiqueta() {
    const data = await fetchReprintData();
    if (!data || !data.roll) return;
    const { roll } = data;

    const today = new Date().toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const isBlackout = isBlackoutProduct(roll.product.category.name);

    generateRollLabel({
      consecutivo:   roll.disaNumber ?? displayRollNumber(roll.rollNumber),
      referencia:    buildFormatRef(roll.product.code, isBlackout),
      color:         buildColor(roll.product.color, roll.product.category.name),
      anchoStr:      `${roll.product.width} cm`,
      metrosActuales: roll.currentMeters,
      metrosIniciales: roll.initialMeters,
      estado:        STATUS_LBL[roll.status] ?? roll.status,
      actualizadoEn: today,
    });
  }

  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      {state.loading && (
        <span className="text-xs text-gray-400">Cargando…</span>
      )}
      {state.error && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
      {!state.loading && !state.error && (
        <>
          {isOwner && (
            <button
              onClick={handleFactura}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 rounded px-2 py-0.5 transition-colors whitespace-nowrap"
            >
              📄 Tirilla
            </button>
          )}
          <button
            onClick={handleEtiqueta}
            className="text-xs text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 bg-amber-50 hover:bg-amber-100 rounded px-2 py-0.5 transition-colors whitespace-nowrap"
          >
            🏷️ Etiqueta
          </button>
        </>
      )}
    </div>
  );
}

const FILTER_GROUPS = [
  {
    label: 'Entradas y salidas',
    options: [
      { value: 'ENTRY', label: 'Entrada de rollo' },
      { value: 'EXIT_FULL', label: 'Salida completa' },
      { value: 'EXIT_PARTIAL', label: 'Corte de rollo' },
      { value: 'RETURN', label: 'Devolución' },
      { value: 'REVERT_SALE', label: 'Venta revertida' },
      { value: 'ADJUSTMENT', label: 'Ajuste de metros' },
    ],
  },
  {
    label: 'Bajas de inventario',
    options: [
      { value: 'WRITE_OFF_PENDING', label: 'Baja — solicitada' },
      { value: 'WRITE_OFF_APPROVED', label: 'Baja — aprobada' },
      { value: 'WRITE_OFF_REJECTED', label: 'Baja — rechazada' },
    ],
  },
  {
    label: 'Defectos con descuento',
    options: [
      { value: 'DEFECT_DISCOUNT_PENDING', label: 'Defecto descuento — solicitado' },
      { value: 'DEFECT_DISCOUNT_APPROVED', label: 'Defecto descuento — aprobado' },
      { value: 'DEFECT_DISCOUNT_REJECTED', label: 'Defecto descuento — rechazado' },
      { value: 'DEFECT_CLEARED', label: 'Defecto eliminado' },
    ],
  },
  {
    label: 'Reposiciones',
    options: [
      { value: 'DEFECT_REPLACEMENT_PENDING', label: 'Reposición — solicitada' },
      { value: 'DEFECT_REPLACEMENT_APPROVED', label: 'Reposición — aprobada' },
      { value: 'DEFECT_REPLACEMENT_REJECTED', label: 'Reposición — rechazada' },
    ],
  },
  {
    label: 'Otros',
    options: [
      { value: 'CREATE_CLIENT', label: 'Cliente creado' },
      { value: 'VOID_MOVEMENT', label: 'Movimiento anulado' },
    ],
  },
];

export default function AuditClient({
  logs, users, userRole,
}: {
  logs: AuditLog[]; users: User[]; userRole: string;
}) {
  const router = useRouter();
  const isOwner = userRole === 'OWNER';
  const canVoid = userRole === 'OWNER' || userRole === 'ADMIN';
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Anular movimiento (TAREA 2) ──────────────────────────────────────────
  const [voidTarget, setVoidTarget] = useState<AuditLog | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState('');

  function openVoidModal(log: AuditLog) {
    setVoidTarget(log);
    setVoidReason('');
    setVoidError('');
  }

  async function handleVoid() {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (reason.length < 10) {
      setVoidError('La razón debe tener al menos 10 caracteres');
      return;
    }
    setVoiding(true); setVoidError('');
    try {
      const res = await fetch('/api/audit/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollId: voidTarget.entityId, createdAt: voidTarget.createdAt, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setVoidError(data.error ?? 'Error al anular movimiento'); return; }
      setVoidTarget(null);
      router.refresh();
    } catch {
      setVoidError('Error de conexión');
    } finally {
      setVoiding(false);
    }
  }

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const matchAction = !actionFilter || l.action === actionFilter;
      const matchUser = !userFilter || l.userName.toLowerCase().includes(userFilter.toLowerCase());
      const matchFrom = !dateFrom || l.createdAt >= new Date(dateFrom).setHours(0, 0, 0, 0);
      const matchTo = !dateTo || l.createdAt <= new Date(dateTo).setHours(23, 59, 59, 999);
      return matchAction && matchUser && matchFrom && matchTo;
    });
  }, [logs, actionFilter, userFilter, dateFrom, dateTo]);

  const hasFilters = actionFilter || userFilter || dateFrom || dateTo;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Auditoría</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registro de acciones del sistema</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Todas las acciones</option>
          {FILTER_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
        </div>
        {hasFilters && (
          <button onClick={() => { setActionFilter(''); setUserFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline self-center">
            Limpiar
          </button>
        )}
        <span className="text-sm text-gray-400 self-center ml-auto">{filtered.length} registros</span>
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Acción</th>
                <th className="px-4 py-3 text-left">Entidad</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Antes</th>
                <th className="px-4 py-3 text-left">Después</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    No hay registros de auditoría
                  </td>
                </tr>
              ) : (
                filtered.map(log => {
                  const exit = isExitAction(log.action);
                  const isVoidRow = log.action === 'VOID_MOVEMENT';
                  let voidReasonText: string | null = null;
                  if (isVoidRow && log.newData) {
                    try { voidReasonText = (JSON.parse(log.newData) as { reason?: string }).reason ?? null; } catch { /* ignore */ }
                  }
                  return (
                    <tr key={log.id} className={`border-b border-[#F5F5F5] hover:bg-gray-50 ${exit && log.voided ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                        {formatColombianDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 text-xs font-medium">{log.userName}</div>
                        <div className="text-gray-400 text-xs">{log.userEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        {exit && log.voided && (
                          <span className="ml-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-red-200 text-red-800">
                            ANULADO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                        {log.entity} #{log.entityId}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {exit ? (log.clientName ?? '—') : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 text-right tabular-nums">
                        {exit && log.saleTotal != null ? formatCOP(log.saleTotal) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-52">
                        {formatAuditData(log.oldData, users)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-52">
                        {isVoidRow ? (
                          <div>
                            <div className="text-red-600 font-semibold">ANULADO</div>
                            {voidReasonText && (
                              <div className="text-gray-500 mt-0.5">Motivo: {voidReasonText}</div>
                            )}
                          </div>
                        ) : formatAuditData(log.newData, users)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 items-start">
                          <ReprintButtons log={log} isOwner={isOwner} />
                          {exit && canVoid && !log.voided && (
                            <button
                              onClick={() => openVoidModal(log)}
                              className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded px-2 py-0.5 transition-colors whitespace-nowrap"
                            >
                              ⛔ Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Anular movimiento — modal (TAREA 2) */}
      {voidTarget && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={() => setVoidTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Anular movimiento</h2>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div><span className="text-gray-400">Entidad: </span><span className="font-mono">{voidTarget.entity} #{voidTarget.entityId}</span></div>
              <div><span className="text-gray-400">Cliente: </span>{voidTarget.clientName ?? '—'}</div>
              <div><span className="text-gray-400">Valor: </span>{voidTarget.saleTotal != null ? formatCOP(voidTarget.saleTotal) : '—'}</div>
              <div><span className="text-gray-400">Fecha: </span>{formatColombianDate(voidTarget.createdAt)}</div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Se restaurarán los metros vendidos al rollo (y su estado se recalculará) y se registrará una nueva entrada de auditoría de anulación. El registro original no se modifica.
            </p>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              Razón de anulación (mínimo 10 caracteres) *
            </label>
            <textarea
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              rows={3}
              placeholder="Explica el motivo de la anulación..."
              className="w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400 mb-1"
            />
            <p className="text-[11px] text-gray-400 mb-3">{voidReason.trim().length}/10 caracteres mínimo</p>
            {voidError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">{voidError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setVoidTarget(null)}
                className="flex-1 border border-[#E5E5E5] rounded px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleVoid} disabled={voiding || voidReason.trim().length < 10}
                className="flex-1 bg-red-600 text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {voiding ? 'Anulando...' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
