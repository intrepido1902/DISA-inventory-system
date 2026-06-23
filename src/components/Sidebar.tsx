'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowRightLeft,
  BookOpen,
  Users,
  UserCog,
  ClipboardList,
  AlertTriangle,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

export interface SidebarUser {
  userId: number;
  email: string;
  name: string;
  role: string;
}

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  roles: string[];
}

const NAV: NavItem[] = [
  { href: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard',        roles: ['OWNER', 'ADMIN', 'WAREHOUSE'] },
  { href: '/inventory',        icon: Package,          label: 'Inventario',       roles: ['OWNER', 'ADMIN', 'WAREHOUSE'] },
  { href: '/movements',        icon: ArrowRightLeft,   label: 'Movimientos',      roles: ['OWNER', 'ADMIN', 'WAREHOUSE'] },
  { href: '/catalog',          icon: BookOpen,          label: 'Catálogo',         roles: ['OWNER', 'ADMIN'] },
  { href: '/clients',          icon: Users,             label: 'Clientes',         roles: ['OWNER', 'ADMIN'] },
  { href: '/pending-defects',  icon: AlertTriangle,     label: 'Bajas pendientes', roles: ['OWNER'] },
  { href: '/users',            icon: UserCog,           label: 'Usuarios',         roles: ['OWNER'] },
  { href: '/audit',            icon: ClipboardList,     label: 'Auditoría',        roles: ['OWNER', 'ADMIN'] },
];

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Socio',
  ADMIN: 'Adriana',
  WAREHOUSE: 'Bodega',
};

interface SidebarProps {
  user: SidebarUser;
  drawer?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ user, drawer = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Fetch pending defect count for OWNER badge
  useEffect(() => {
    if (user.role !== 'OWNER') return;
    fetch('/api/movements/pending')
      .then(r => r.json())
      .then(data => Array.isArray(data) && setPendingCount(data.length))
      .catch(() => {});
  }, [user.role]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const userItems = NAV.filter(item => item.roles.includes(user.role));

  if (drawer) {
    return (
      <div className="w-56 h-full bg-[#0A0A0A] flex flex-col py-4 border-r border-[#1A1A1A]">
        <div className="flex items-center justify-between px-4 mb-6">
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-black font-black text-sm leading-none">D</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-[0.15em]">DISA</span>
          </Link>
          {onClose && (
            <button onClick={onClose} className="text-[#555] hover:text-white transition-colors text-lg leading-none p-1">
              ✕
            </button>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 px-2">
          {userItems.map(item => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
            const Icon = item.icon;
            const hasBadge = item.href === '/pending-defects' && pendingCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors ${
                  isActive ? 'bg-white text-black font-semibold' : 'text-[#888] hover:text-white hover:bg-[#1A1A1A]'
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {hasBadge && (
                  <span className="bg-amber-400 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pt-3 border-t border-[#1A1A1A] mt-2">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex items-center justify-center flex-shrink-0">
              <span className="text-[#aaa] text-xs font-semibold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.name}</p>
              <p className="text-[#666] text-[10px]">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-[#555] hover:text-red-400 hover:bg-[#1A1A1A] transition-colors text-sm disabled:opacity-40"
          >
            <LogOut size={16} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    );
  }

  // ── DESKTOP MODE: icon-only, w-14 ──
  return (
    <aside className="fixed top-0 left-0 h-full w-14 bg-[#0A0A0A] flex flex-col items-center py-3 z-50 border-r border-[#1A1A1A]">
      <Link href="/dashboard" className="mb-6 flex-shrink-0" title="DISA — Inicio">
        <div className="w-9 h-9 bg-white flex items-center justify-center">
          <span className="text-black font-black text-base leading-none">D</span>
        </div>
      </Link>

      <nav className="flex flex-col items-center gap-1 flex-1">
        {userItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
          const Icon = item.icon;
          const hasBadge = item.href === '/pending-defects' && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={hasBadge ? `${item.label} (${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''})` : item.label}
              className={`relative w-10 h-10 flex items-center justify-center rounded transition-colors ${
                isActive ? 'bg-white text-black' : 'text-[#555] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              <Icon size={18} />
              {hasBadge && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-400 text-black text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {pendingCount > 9 ? '9' : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

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
          className="w-8 h-8 flex items-center justify-center rounded text-[#555] hover:text-red-400 hover:bg-[#1A1A1A] transition-colors disabled:opacity-40"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
