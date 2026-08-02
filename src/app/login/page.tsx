'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Credenciales incorrectas');
        return;
      }

      if (data.mustChangePassword) {
        router.push(`/change-password?token=${encodeURIComponent(data.tempToken)}`);
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

        <h1 className="text-white text-2xl font-semibold mb-1">Iniciar sesión</h1>
        <p className="text-[#666] text-sm mb-8">Sistema de inventario DISA</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-1.5">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="tu nombre de usuario"
              className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-white placeholder-[#444] rounded px-4 py-3 text-sm focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-white placeholder-[#444] rounded px-4 py-3 pr-12 text-sm focus:outline-none focus:border-[#444] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-[#555] hover:text-[#999] transition-colors"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
