'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Socio', ADMIN: 'Administrador', WAREHOUSE: 'Bodega', DEVELOPER: 'Developer',
};
const ROLE_CLASS: Record<string, string> = {
  OWNER: 'bg-amber-100 text-amber-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  WAREHOUSE: 'bg-green-100 text-green-700',
  DEVELOPER: 'bg-purple-100 text-purple-700',
};
const MOV_LABEL: Record<string, string> = {
  ENTRY: 'Entrada', EXIT_FULL: 'Salida total', EXIT_PARTIAL: 'Salida parcial',
  ADJUSTMENT: 'Ajuste', WRITE_OFF: 'Baja', RETURN: 'Devolución',
  DEFECT_DISCOUNT_PENDING: 'Defecto pend.', DEFECT_DISCOUNT_APPROVED: 'Defecto aprobado',
  DEFECT_DISCOUNT_REJECTED: 'Defecto rechazado', WRITE_OFF_PENDING: 'Baja pend.',
  WRITE_OFF_APPROVED: 'Baja aprobada', WRITE_OFF_REJECTED: 'Baja rechazada',
};

interface User {
  id: number; email: string; name: string; role: string;
  active: number; mustChangePassword: boolean; createdAt: number;
}
interface Movement {
  id: number; type: string; createdAt: number; approvalStatus?: string;
  user: { name: string } | null;
  roll: { rollNumber: string; product: { name: string; code: string } | null } | null;
}

interface Props {
  developerName: string;
  userCount: number;
  activeRolls: number;
  initialUsers: User[];
  recentMovements: Movement[];
}

export default function DevPanel({ developerName, userCount, activeRolls, initialUsers, recentMovements }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('WAREHOUSE');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdTemp, setCreatedTemp] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ userId: number; tempPassword: string } | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    try {
      const res = await fetch('/api/dev/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? 'Error al crear usuario'); return; }
      setUsers(prev => [...prev, { ...data, active: 1, mustChangePassword: true, createdAt: Date.now() }]);
      setCreatedTemp({ name: data.name, email: data.email, tempPassword: data.tempPassword });
      setNewEmail(''); setNewName(''); setNewRole('WAREHOUSE'); setCreating(false);
    } catch {
      setCreateError('Error de conexión');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleAction(userId: number, action: string, extra?: object) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/dev/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'Error'); return; }

      if (action === 'toggle-active') {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, active: u.active ? 0 : 1 } : u));
      } else if (action === 'reset-password') {
        setResetResult({ userId, tempPassword: data.tempPassword });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, mustChangePassword: true } : u));
      } else if (action === 'change-role') {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: (extra as any).role } : u));
      }
    } catch {
      alert('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-4 lg:p-8">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-black font-black text-lg leading-none">D</span>
            </div>
            <div>
              <span className="text-white text-lg font-semibold tracking-[0.15em] uppercase">DISA</span>
              <span className="ml-2 text-xs text-purple-400 font-mono uppercase tracking-widest">DEV</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#666] text-sm">{developerName}</span>
            <button
              onClick={handleLogout}
              className="text-[#666] text-sm hover:text-white transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-[#111] border border-[#222] rounded-lg p-5">
            <p className="text-[#666] text-xs uppercase tracking-wider mb-1">Usuarios totales</p>
            <p className="text-3xl font-bold text-white">{userCount}</p>
          </div>
          <div className="bg-[#111] border border-[#222] rounded-lg p-5">
            <p className="text-[#666] text-xs uppercase tracking-wider mb-1">Rollos activos</p>
            <p className="text-3xl font-bold text-white">{activeRolls}</p>
          </div>
        </div>

        {/* Created user temp password banner */}
        {createdTemp && (
          <div className="mb-6 bg-emerald-950 border border-emerald-700 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-emerald-400 font-semibold text-sm mb-1">Usuario creado: {createdTemp.name}</p>
                <p className="text-emerald-300 text-xs mb-2">{createdTemp.email}</p>
                <p className="text-[#888] text-xs mb-1">Contraseña temporal (mostrar UNA sola vez):</p>
                <p className="font-mono text-emerald-200 text-base bg-black/40 rounded px-3 py-2 inline-block">
                  {createdTemp.tempPassword}
                </p>
              </div>
              <button onClick={() => setCreatedTemp(null)} className="text-[#555] hover:text-white text-lg leading-none ml-4">×</button>
            </div>
          </div>
        )}

        {/* Reset password result banner */}
        {resetResult && (
          <div className="mb-6 bg-amber-950 border border-amber-700 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-amber-400 font-semibold text-sm mb-1">Contraseña restablecida</p>
                <p className="text-[#888] text-xs mb-1">Nueva contraseña temporal (mostrar UNA sola vez):</p>
                <p className="font-mono text-amber-200 text-base bg-black/40 rounded px-3 py-2 inline-block">
                  {resetResult.tempPassword}
                </p>
              </div>
              <button onClick={() => setResetResult(null)} className="text-[#555] hover:text-white text-lg leading-none ml-4">×</button>
            </div>
          </div>
        )}

        {/* Users section */}
        <div className="bg-[#111] border border-[#222] rounded-lg mb-8">
          <div className="px-5 py-4 border-b border-[#222] flex items-center justify-between">
            <h2 className="font-semibold text-white">Usuarios del sistema</h2>
            <button
              onClick={() => { setCreating(v => !v); setCreateError(''); }}
              className="text-xs bg-white text-black font-semibold px-3 py-1.5 rounded hover:bg-gray-100 transition-colors"
            >
              {creating ? 'Cancelar' : '+ Nuevo usuario'}
            </button>
          </div>

          {creating && (
            <form onSubmit={handleCreate} className="px-5 py-4 border-b border-[#222] bg-[#0D0D0D]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-[#888] text-xs uppercase tracking-wider mb-1">Nombre</label>
                  <input
                    value={newName} onChange={e => setNewName(e.target.value)} required
                    placeholder="Nombre completo"
                    className="w-full bg-[#1A1A1A] border border-[#333] text-white placeholder-[#444] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#555]"
                  />
                </div>
                <div>
                  <label className="block text-[#888] text-xs uppercase tracking-wider mb-1">Correo</label>
                  <input
                    type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required
                    placeholder="correo@disa.co"
                    className="w-full bg-[#1A1A1A] border border-[#333] text-white placeholder-[#444] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#555]"
                  />
                </div>
                <div>
                  <label className="block text-[#888] text-xs uppercase tracking-wider mb-1">Rol</label>
                  <select
                    value={newRole} onChange={e => setNewRole(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-[#333] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-[#555]"
                  >
                    <option value="WAREHOUSE">Bodega</option>
                    <option value="ADMIN">Administrador</option>
                    <option value="OWNER">Socio</option>
                  </select>
                </div>
              </div>
              {createError && (
                <p className="text-red-400 text-xs mb-3 bg-red-950/30 border border-red-900 rounded px-3 py-2">{createError}</p>
              )}
              <button
                type="submit" disabled={createLoading}
                className="bg-white text-black text-sm font-semibold px-4 py-2 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {createLoading ? 'Creando...' : 'Crear usuario'}
              </button>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[#222] text-xs text-[#666] uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Nombre</th>
                  <th className="px-5 py-3 text-left">Correo</th>
                  <th className="px-5 py-3 text-left">Rol</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isLoading = actionLoading === u.id;
                  return (
                    <tr key={u.id} className="border-b border-[#1A1A1A] hover:bg-[#141414]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#222] flex items-center justify-center text-[#888] font-semibold text-xs flex-shrink-0">
                            {u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-white font-medium">{u.name}</span>
                            {u.mustChangePassword && (
                              <span className="ml-2 text-xs text-amber-400">(debe cambiar contraseña)</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[#888]">{u.email}</td>
                      <td className="px-5 py-3">
                        {u.role === 'DEVELOPER' ? (
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_CLASS[u.role] ?? 'bg-gray-700 text-gray-300'}`}>
                            {ROLE_LABEL[u.role] ?? u.role}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={isLoading}
                            onChange={e => handleAction(u.id, 'change-role', { role: e.target.value })}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none ${ROLE_CLASS[u.role] ?? 'bg-gray-700 text-gray-300'} bg-opacity-80`}
                          >
                            <option value="WAREHOUSE">Bodega</option>
                            <option value="ADMIN">Administrador</option>
                            <option value="OWNER">Socio</option>
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${u.active ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
                          {u.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {u.role !== 'DEVELOPER' && (
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isLoading}
                              onClick={() => handleAction(u.id, 'toggle-active')}
                              className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${u.active ? 'border-red-800 text-red-400 hover:bg-red-950/40' : 'border-green-800 text-green-400 hover:bg-green-950/40'}`}
                            >
                              {u.active ? 'Desactivar' : 'Activar'}
                            </button>
                            <button
                              disabled={isLoading}
                              onClick={() => handleAction(u.id, 'reset-password')}
                              className="text-xs px-2.5 py-1 rounded border border-[#333] text-[#888] hover:text-white hover:border-[#555] transition-colors disabled:opacity-50"
                            >
                              {isLoading ? '...' : 'Resetear clave'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-[#111] border border-[#222] rounded-lg">
          <div className="px-5 py-4 border-b border-[#222]">
            <h2 className="font-semibold text-white">Actividad reciente</h2>
            <p className="text-xs text-[#666] mt-0.5">Últimos {recentMovements.length} movimientos</p>
          </div>
          {recentMovements.length === 0 ? (
            <p className="px-5 py-8 text-center text-[#555] text-sm">Sin movimientos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-[#222] text-xs text-[#666] uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Tipo</th>
                    <th className="px-5 py-3 text-left">Rollo / Producto</th>
                    <th className="px-5 py-3 text-left">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMovements.map(m => (
                    <tr key={m.id} className="border-b border-[#1A1A1A] hover:bg-[#141414]">
                      <td className="px-5 py-3 text-[#666] text-xs tabular-nums">
                        {new Date(m.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs bg-[#1A1A1A] text-[#aaa] px-2 py-0.5 rounded">
                          {MOV_LABEL[m.type] ?? m.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#aaa] text-xs">
                        {m.roll ? (
                          <span>{m.roll.rollNumber} <span className="text-[#555]">· {m.roll.product?.name ?? ''}</span></span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 text-[#777] text-xs">{m.user?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
