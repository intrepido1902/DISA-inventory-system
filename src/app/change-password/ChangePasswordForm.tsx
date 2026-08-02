'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChangePasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!token) {
      setError('Enlace inválido. Inicia sesión de nuevo.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al cambiar la contraseña.');
        return;
      }
      router.push(data.role === 'DEVELOPER' ? '/dev' : '/dashboard');
      router.refresh();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 bg-white flex items-center justify-center flex-shrink-0">
            <span className="text-black font-black text-xl leading-none">D</span>
          </div>
          <span className="text-white text-2xl font-semibold tracking-[0.2em] uppercase">DISA</span>
        </div>

        <h1 className="text-white text-2xl font-semibold mb-1">Crea tu contraseña</h1>
        <p className="text-[#666] text-sm mb-8">
          Bienvenido/a. Elige una contraseña segura para acceder al sistema.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-1.5">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-white placeholder-[#444] rounded px-4 py-3 text-sm focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-1.5">
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Repite tu contraseña"
              className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-white placeholder-[#444] rounded px-4 py-3 text-sm focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-semibold rounded px-4 py-3 text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
          >
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
