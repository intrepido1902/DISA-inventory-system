'use client';

import { useState, useMemo } from 'react';
import { formatColombianDate } from '@/lib/dateUtils';
import { ACTION_LABELS, ACTION_COLORS, formatAuditData } from '@/lib/auditLabels';
import { generateSalePDF, type SalePDFData } from '@/lib/generateSalePDF';
import { generateRollLabel } from '@/lib/generateRollLabel';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';

interface AuditLog {
  id: number; action: string; entity: string; entityId: number;
  oldData: string | null; newData: string | null; createdAt: number;
  userName: string; userEmail: string;
}
interface User { id: number; name: string }

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
    ],
  },
];

export default function AuditClient({
  logs, users, userRole,
}: {
  logs: AuditLog[]; users: User[]; userRole: string;
}) {
  const isOwner = userRole === 'OWNER';
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-left">Acción</th>
                <th className="px-4 py-3 text-left">Entidad</th>
                <th className="px-4 py-3 text-left">Antes</th>
                <th className="px-4 py-3 text-left">Después</th>
                <th className="px-4 py-3 text-left">Reimprimir</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No hay registros de auditoría
                  </td>
                </tr>
              ) : (
                filtered.map(log => (
                  <tr key={log.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
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
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                      {log.entity} #{log.entityId}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-52">
                      {formatAuditData(log.oldData, users)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 max-w-52">
                      {formatAuditData(log.newData, users)}
                    </td>
                    <td className="px-4 py-3">
                      <ReprintButtons log={log} isOwner={isOwner} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
