'use client';

import { useState, useMemo } from 'react';
import { formatColombianDate } from '@/lib/dateUtils';
import { ACTION_LABELS, ACTION_COLORS, formatAuditData } from '@/lib/auditLabels';

interface AuditLog {
  id: number; action: string; entity: string; entityId: number;
  oldData: string | null; newData: string | null; createdAt: number;
  userName: string; userEmail: string;
}
interface User { id: number; name: string }

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

export default function AuditClient({ logs, users }: { logs: AuditLog[]; users: User[] }) {
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
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
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
