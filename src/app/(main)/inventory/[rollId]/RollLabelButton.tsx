'use client';

import { generateRollLabel, type RollLabelData } from '@/lib/generateRollLabel';

export default function RollLabelButton({ data }: { data: RollLabelData }) {
  return (
    <button
      type="button"
      onClick={() => generateRollLabel(data)}
      className="text-xs text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 bg-amber-50 hover:bg-amber-100 rounded px-2 py-1 transition-colors whitespace-nowrap"
    >
      🏷️ Etiqueta
    </button>
  );
}
