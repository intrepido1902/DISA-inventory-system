'use client';

import { useState, useMemo } from 'react';
import { getBlackoutColorName, isBlackoutProduct } from '@/lib/colorMap';

interface Product {
  id: number; name: string; code: string; color: string; width: number;
  priceOwner: number; priceB2B: number; priceB2C: number;
  category: { id: number; name: string };
  activeRolls: number; totalMeters: number;
}

// Cambio 9: format reference — Blackout "2306-2", Velo "2238"
function formatRef(code: string, isBlackout: boolean): string {
  const parts = code.split('-');
  return isBlackout ? `${parts[0]}-${parts[1] ?? ''}` : parts[0];
}

// Strip the base code number from the product name
function productDisplayName(name: string, code: string): string {
  const base = code.split('-')[0];
  const cleaned = name.replace(new RegExp(`\\b${base}\\b`, 'g'), '').trim().replace(/\s+/g, ' ');
  return cleaned || name;
}

function displayColor(product: Product): string {
  if (isBlackoutProduct(product.category.name)) {
    return getBlackoutColorName(product.color);
  }
  return product.color;
}

export default function CatalogClient({ products, isOwner }: { products: Product[]; isOwner: boolean }) {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchCat = !categoryFilter || p.category.name === categoryFilter;
      const matchSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        displayColor(p).toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, search]);

  const veloCount = products.filter(p => p.category.name === 'Velo').length;
  const blackoutCount = products.filter(p => p.category.name === 'Blackout').length;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Catálogo</h1>
        <p className="text-sm text-gray-500 mt-0.5">{veloCount} velos · {blackoutCount} blackout</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, referencia, color..."
          className="flex-1 min-w-48 border border-[#E5E5E5] bg-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
        />
        <div className="flex gap-2">
          {['', 'Velo', 'Blackout'].map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#0A0A0A] text-white'
                  : 'bg-white border border-[#E5E5E5] text-gray-600 hover:bg-gray-50'
              }`}>
              {cat || 'Todos'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
        {filtered.map(product => {
          const isBlackout = isBlackoutProduct(product.category.name);
          const ref = formatRef(product.code, isBlackout);
          const pName = productDisplayName(product.name, product.code);
          const color = displayColor(product);
          const hasStock = product.totalMeters > 0;
          const lowStock = product.activeRolls > 0 && product.activeRolls < 5;

          return (
            <div
              key={product.id}
              className={`bg-white rounded-lg border p-4 flex flex-col gap-3 ${lowStock ? 'border-amber-300' : 'border-[#E5E5E5]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isBlackout ? 'bg-gray-900 text-white' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {product.category.name}
                    </span>
                    {lowStock && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        Stock bajo
                      </span>
                    )}
                    {!hasStock && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                        Sin stock
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mt-2 text-sm leading-snug">{pName}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{color}</p>
                </div>
                <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded border border-[#E5E5E5] whitespace-nowrap flex-shrink-0">
                  {ref}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-400 block">Ancho</span>
                  <span className="font-semibold text-gray-700">{product.width} cm</span>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-400 block">Rollos activos</span>
                  <span className={`font-semibold ${!hasStock ? 'text-red-500' : 'text-gray-700'}`}>
                    {product.activeRolls}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Metros disponibles</span>
                  <span className={`font-semibold ${!hasStock ? 'text-red-500' : lowStock ? 'text-amber-600' : 'text-green-700'}`}>
                    {Number(product.totalMeters).toLocaleString('es-CO')} m
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${!hasStock ? 'bg-red-300' : lowStock ? 'bg-amber-400' : 'bg-green-500'}`}
                    style={{ width: `${hasStock ? Math.max(4, Math.min(100, product.totalMeters / 3)) : 0}%` }}
                  />
                </div>
              </div>

              {isOwner && (
                <div className="pt-2 border-t border-[#F0F0F0]">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Precio B2B /m</span>
                    <span className="font-semibold text-gray-800">
                      {new Intl.NumberFormat('es-CO', {
                        style: 'currency', currency: 'COP', maximumFractionDigits: 0,
                      }).format(product.priceB2B)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">No se encontraron productos</div>
      )}
    </div>
  );
}
