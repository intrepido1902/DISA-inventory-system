'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar, { type SidebarUser } from './Sidebar';

export default function LayoutWrapper({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SidebarUser;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Cierra el drawer al navegar
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[#F5F5F5]">
      {/* ── DESKTOP SIDEBAR: siempre visible ≥lg ── */}
      <div className="hidden lg:block">
        <Sidebar user={user} />
      </div>

      {/* ── MOBILE OVERLAY ── */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── MOBILE/TABLET DRAWER ── */}
      <div
        className={`lg:hidden fixed top-0 left-0 h-full z-50 transition-transform duration-200 ease-in-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar user={user} drawer onClose={() => setDrawerOpen(false)} />
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 min-h-screen lg:ml-14 flex flex-col">
        {/* Mobile/tablet header con hamburguesa */}
        <header className="lg:hidden sticky top-0 z-30 bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-white w-10 h-10 flex items-center justify-center rounded hover:bg-[#1A1A1A] transition-colors text-lg"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="text-white font-semibold text-sm tracking-[0.2em] uppercase">DISA</span>
        </header>

        {/* Contenido de la página */}
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
