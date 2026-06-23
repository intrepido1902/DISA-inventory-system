'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatColombianDate } from '@/lib/dateUtils';

interface RejectedMovement {
  id: number;
  type: string;
  notes: string | null;
  rejectionComment: string | null;
  createdAt: number;
  approvedAt: number | null;
  approverName: string | null;
  roll: {
    id: number | null;
    disaNumber: string | null;
    rollNumber: string;
    productName: string;
    productCode: string;
    color: string;
    width: number;
  };
}

const TYPE_LABEL: Record<string, string> = {
  WRITE_OFF: 'Baja total',
  DEFECT_DISCOUNT: 'Defecto con descuento',
  DEFECT_REPLACEMENT: 'Defecto con reposición',
};

function displayRollNumber(rollNumber: string): string {
  const n = parseInt(rollNumber, 10);
  return isNaN(n) ? rollNumber : String(n);
}

export default function RejectedDefectsPanel() {
  const [items, setItems] = useState<RejectedMovement[]>([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/movements/my-rejected')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => {/* silent */});
  }, []);

  if (items.length === 0) return null;

  async function markSeen(id: number) {
    setMarking(id);
    try {
      await fetch(`/api/movements/${id}/mark-seen`, { method: 'POST' });
      setItems(prev => prev.filter(m => m.id !== id));
    } finally {
      setMarking(null);
    }
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left hover:bg-red-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">❌</span>
          <span className="text-sm font-semibold text-red-900">
            {items.length === 1
              ? 'Tienes 1 baja rechazada sin revisar'
              : `Tienes ${items.length} bajas rechazadas sin revisar`}
          </span>
        </div>
        <span className="text-xs text-red-600 font-medium">{open ? 'Ocultar ▲' : 'Ver detalle ▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {items.map(m => {
            const rollLabel = m.roll.disaNumber ?? displayRollNumber(m.roll.rollNumber);
            return (
              <div key={m.id} className="bg-white border border-red-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {TYPE_LABEL[m.type] ?? m.type}
                      </span>
                      <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                        ❌ Rechazado
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-bold text-gray-900">{rollLabel}</span>
                      {m.roll.id && (
                        <Link href={`/inventory/${m.roll.id}`} className="text-xs text-blue-600 hover:underline">
                          Ver trazabilidad →
                        </Link>
                      )}
                    </div>

                    <p className="text-sm text-gray-700 mt-0.5">
                      {m.roll.productName} · {m.roll.color} · {m.roll.width} cm
                    </p>

                    {m.notes && (
                      <p className="text-xs text-gray-500 italic bg-gray-50 border border-[#F0F0F0] rounded px-2.5 py-1.5 mt-2">
                        Tu nota: {m.notes}
                      </p>
                    )}

                    {m.rejectionComment && (
                      <div className="bg-red-50 border border-red-100 rounded px-2.5 py-1.5 mt-2">
                        <p className="text-xs text-red-800">
                          <span className="font-semibold">Motivo del rechazo:</span> {m.rejectionComment}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-2">
                      Rechazado{m.approverName ? ` por ${m.approverName}` : ''}{m.approvedAt ? ` · ${formatColombianDate(m.approvedAt)}` : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => markSeen(m.id)}
                    disabled={marking === m.id}
                    className="flex-shrink-0 border border-[#E5E5E5] text-gray-600 hover:bg-gray-50 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {marking === m.id ? '...' : 'Marcar como visto'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
