'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEMO_USERS = [
  { email: 'samir@disa.co', password: 'admin2026', label: 'Socio', role: 'OWNER' },
  { email: 'william@disa.co', password: 'william2026', label: 'Socio', role: 'OWNER' },
  { email: 'admin@disa.co', password: 'admin2026', label: 'Admin', role: 'ADMIN' },
  { email: 'bodega@disa.co', password: 'bodega2026', label: 'Bodega', role: 'WAREHOUSE' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Credenciales incorrectas');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(u: typeof DEMO_USERS[0]) {
    setEmail(u.email);
    setPassword(u.password);
    setError('');
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
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
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="usuario@disa.co"
              className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-white placeholder-[#444] rounded px-4 py-3 text-sm focus:outline-none focus:border-[#444] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
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
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* Demo users */}
        <div className="mt-8 pt-8 border-t border-[#1A1A1A]">
          <p className="text-[#555] text-xs uppercase tracking-wider mb-3">Acceso rápido demo</p>
          <div className="space-y-2">
            {DEMO_USERS.map(u => (
              <button
                key={u.email}
                type="button"
                onClick={() => fillDemo(u)}
                className="w-full flex items-center justify-between bg-[#111] hover:bg-[#1A1A1A] border border-[#1E1E1E] rounded px-4 py-2.5 text-left transition-colors group"
              >
                <span className="text-[#888] text-xs">{u.email}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  u.role === 'OWNER' ? 'bg-amber-950/60 text-amber-400' :
                  u.role === 'ADMIN' ? 'bg-blue-950/60 text-blue-400' :
                  'bg-green-950/60 text-green-400'
                }`}>
                  {u.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
