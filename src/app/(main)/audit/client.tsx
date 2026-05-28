'use client';

import { useState, useMemo } from 'react';

interface AuditLog {
  id: number;
  action: string;
  entity: string;
  entityId: number;
  oldData: string | null;
  newData: string | null;
  createdAt: number;
  userName: string;
  userEmail: string;
}

interface User { id: number; name: string }

const ACTION_LABEL: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT_FULL: 'Salida total',
  EXIT_PARTIAL: 'Salida parcial',
  ADJUSTMENT: 'Ajuste',
  WRITE_OFF: 'Baja',
};
const ACTION_CLASS: Record<string, string> = {
  ENTRY: 'bg-green-100 text-green-700',
  EXIT_FULL: 'bg-red-100 text-red-700',
  EXIT_PARTIAL: 'bg-orange-100 text-orange-700',
  ADJUSTMENT: 'bg-blue-100 text-blue-700',
  WRITE_OFF: 'bg-gray-100 text-gray-600',
};

function JsonCell({ value }: { value: string | null }) {
  const [open, setOpen] = useState(false);
  if (!value) return <span className="text-gray-300">—</span>;

  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return <span className="text-gray-400 text-xs font-mono">{value}</span>; }

  const preview = JSON.stringify(parsed).slice(0, 40);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-500 hover:text-blue-700 font-mono text-left"
      >
        {open ? '▾' : '▸'} {preview}{preview.length >= 40 ? '…' : ''}
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-w-xs max-h-32 text-gray-600">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditClient({ logs, users }: { logs: AuditLog[]; users: User[] }) {
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const matchAction = !actionFilter || l.action === actionFilter;
      const matchUser = !userFilter || String(l.userEmail).includes(userFilter) || l.userName.toLowerCase().includes(userFilter.toLowerCase());
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        >
          <option value="">Todas las acciones</option>
          <option value="ENTRY">Entrada</option>
          <option value="EXIT_FULL">Salida total</option>
          <option value="EXIT_PARTIAL">Salida parcial</option>
          <option value="ADJUSTMENT">Ajuste</option>
          <option value="WRITE_OFF">Baja</option>
        </select>

        <select
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        >
          <option value="">Todos los usuarios</option>
          {users.map(u => (
            <option key={u.id} value={u.name}>{u.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => { setActionFilter(''); setUserFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline self-center"
          >
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
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Antes</th>
                <th className="px-4 py-3 text-left">Después</th>
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
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 text-xs font-medium">{log.userName}</div>
                      <div className="text-gray-400 text-xs">{log.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_CLASS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ACTION_LABEL[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">{log.entity}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">#{log.entityId}</td>
                    <td className="px-4 py-3 max-w-48">
                      <JsonCell value={log.oldData} />
                    </td>
                    <td className="px-4 py-3 max-w-48">
                      <JsonCell value={log.newData} />
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
