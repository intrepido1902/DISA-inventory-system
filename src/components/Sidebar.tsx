'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

interface SidebarUser {
  userId: number;
  email: string;
  name: string;
  role: string;
}

const NAV = [
  { href: '/dashboard',              icon: '◈', label: 'Dashboard',      roles: ['OWNER', 'WAREHOUSE'] },
  { href: '/inventory',              icon: '⊟', label: 'Inventario',     roles: ['OWNER', 'WAREHOUSE'] },
  { href: '/inventory?tab=remnants', icon: '◫', label: 'Remanentes',     roles: ['OWNER', 'WAREHOUSE'] },
  { href: '/inventory?exitModal=1',  icon: '↑', label: 'Nueva Salida',   roles: ['OWNER', 'WAREHOUSE'] },
  { href: '/catalog',                icon: '⊞', label: 'Catálogo',       roles: ['OWNER'] },
  { href: '/movements',              icon: '↕', label: 'Movimientos',    roles: ['OWNER', 'WAREHOUSE'] },
  { href: '/clients',                icon: '◎', label: 'Clientes',       roles: ['OWNER'] },
  { href: '/users',                  icon: '◯', label: 'Usuarios',       roles: ['OWNER'] },
];

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Socio',
  WAREHOUSE: 'Bodega',
};

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className="fixed top-0 left-0 h-full w-14 bg-[#0A0A0A] flex flex-col items-center py-3 z-50 border-r border-[#1A1A1A]">
      {/* Logo */}
      <Link href="/dashboard" className="mb-6 flex-shrink-0" title="DISA — Inicio">
        <div className="w-9 h-9 bg-white flex items-center justify-center">
          <span className="text-black font-black text-base leading-none">D</span>
        </div>
      </Link>

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {NAV.filter(item => item.roles.includes(user.role)).map(item => {
          const isActive = item.href === '/inventory'
            ? pathname === '/inventory' && !item.href.includes('?')
            : item.href.startsWith('/inventory?')
              ? false
              : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`w-10 h-10 flex items-center justify-center rounded text-lg transition-colors ${
                isActive
                  ? 'bg-white text-black'
                  : 'text-[#555] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex items-center justify-center"
          title={`${user.name} — ${ROLE_LABEL[user.role] ?? user.role}`}
        >
          <span className="text-[#aaa] text-xs font-semibold">{initials}</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Cerrar sesión"
          className="w-8 h-8 flex items-center justify-center rounded text-[#555] hover:text-red-400 hover:bg-[#1A1A1A] transition-colors text-sm disabled:opacity-40"
        >
          ⏻
        </button>
      </div>
    </aside>
  );
}
