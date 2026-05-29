'use client';

import { useState } from 'react';

interface LowStockProduct {
  name: string;
  code: string;
  activeRolls: number;
}

const BATCH = 8;

export default function LowStockPanel({ products }: { products: LowStockProduct[] }) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? products : products.slice(0, BATCH);
  const hidden = products.length - BATCH;

  return (
    <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <p className="text-amber-800 text-sm font-medium mb-2">
        ⚠ {products.length} referencia{products.length !== 1 ? 's' : ''} con stock bajo (&lt; 5 rollos activos)
      </p>
      <div className="flex flex-wrap gap-2 mt-1">
        {visible.map(p => (
          <span
            key={p.code}
            className="text-xs bg-amber-100 border border-amber-300 text-amber-700 rounded px-2 py-0.5"
          >
            {p.code.split('-')[0]} · {p.activeRolls} rollo{p.activeRolls !== 1 ? 's' : ''}
          </span>
        ))}
        {!expanded && hidden > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-amber-700 border border-amber-300 bg-amber-100 hover:bg-amber-200 rounded px-2 py-0.5 transition-colors"
          >
            +{hidden} más
          </button>
        )}
        {expanded && products.length > BATCH && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-amber-700 border border-amber-300 bg-amber-100 hover:bg-amber-200 rounded px-2 py-0.5 transition-colors"
          >
            Ver menos
          </button>
        )}
      </div>
    </div>
  );
}
