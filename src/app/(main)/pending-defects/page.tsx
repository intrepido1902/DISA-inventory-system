'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatColombianDate } from '@/lib/dateUtils';

interface PendingMovement {
  id: number;
  type: string;
  meters: number;
  notes: string | null;
  createdAt: number;
  reportedBy: string;
  roll: {
    id: number | null;
    disaNumber: string | null;
    rollNumber: string;
    currentMeters: number;
    status: string;
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

const TYPE_COLOR: Record<string, string> = {
  WRITE_OFF: 'bg-gray-100 text-gray-700',
  DEFECT_DISCOUNT: 'bg-orange-100 text-orange-700',
  DEFECT_REPLACEMENT: 'bg-purple-100 text-purple-700',
};

function displayRollNumber(rollNumber: string): string {
  const n = parseInt(rollNumber, 10);
  return isNaN(n) ? rollNumber : String(n);
}

export default function PendingDefectsPage() {
  const [items, setItems] = useState<PendingMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/movements/pending')
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setError('Error al cargar bajas pendientes'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(movementId: number, action: 'approve' | 'reject') {
    setActing(movementId);
    setError('');
    try {
      const res = await fetch(`/api/movements/${movementId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al procesar'); return; }
      setItems(prev => prev.filter(m => m.id !== movementId));
    } catch {
      setError('Error de conexión');
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Bajas pendientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Defectos y bajas reportados que requieren tu aprobación</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-[#E5E5E5] px-5 py-12 text-center text-gray-400 text-sm">
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#E5E5E5] px-5 py-16 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-gray-500 text-sm">No hay bajas pendientes de aprobación</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(m => (
            <div key={m.id} className="bg-white rounded-lg border border-amber-200 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOR[m.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABEL[m.type] ?? m.type}
                    </span>
                    <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                      ⚠️ Pendiente
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-bold text-gray-900 text-lg">
                      {m.roll.disaNumber ?? displayRollNumber(m.roll.rollNumber)}
                    </span>
                    {m.roll.id && (
                      <Link href={`/inventory/${m.roll.id}`}
                        className="text-xs text-blue-600 hover:underline">
                        Ver trazabilidad →
                      </Link>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 mt-0.5">
                    {m.roll.productName} · {m.roll.color} · {m.roll.width} cm
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.meters} m afectados · Ref: <span className="font-mono">{m.roll.productCode.split('-')[0]}</span>
                  </p>

                  {m.notes && (
                    <p className="text-xs text-gray-500 italic bg-gray-50 border border-[#F0F0F0] rounded px-2.5 py-1.5 mt-2">
                      {m.notes}
                    </p>
                  )}

                  <p className="text-xs text-gray-400 mt-2">
                    Reportado por <span className="font-medium text-gray-600">{m.reportedBy}</span> · {formatColombianDate(m.createdAt)}
                  </p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAction(m.id, 'reject')}
                    disabled={acting === m.id}
                    className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    {acting === m.id ? '...' : '❌ Rechazar'}
                  </button>
                  <button
                    onClick={() => handleAction(m.id, 'approve')}
                    disabled={acting === m.id}
                    className="bg-green-600 text-white hover:bg-green-700 rounded px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    {acting === m.id ? '...' : '✅ Aprobar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
