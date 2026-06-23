'use client';

import { generateSalePDF, type SalePDFData } from '@/lib/generateSalePDF';

export default function ReimprimirButton({ data }: { data: SalePDFData }) {
  return (
    <button
      type="button"
      onClick={() => generateSalePDF(data)}
      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 rounded px-2 py-1 transition-colors whitespace-nowrap"
    >
      📄 Tirilla
    </button>
  );
}
