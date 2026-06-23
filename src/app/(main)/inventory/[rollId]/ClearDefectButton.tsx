'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClearDefectButton({ rollId }: { rollId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClear() {
    if (!confirm('¿Quitar la marca de defecto de este rollo?')) return;
    setLoading(true);
    try {
      await fetch(`/api/inventory/${rollId}/clear-defect`, { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={loading}
      className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-400 bg-white rounded px-2 py-1 transition-colors whitespace-nowrap disabled:opacity-40"
    >
      {loading ? '...' : '✕ Quitar defecto'}
    </button>
  );
}
