export const ACTION_LABELS: Record<string, string> = {
  ENTRY: 'Entrada de rollo',
  EXIT_FULL: 'Salida de rollo completo',
  EXIT_PARTIAL: 'Corte de rollo',
  RETURN: 'Devolución',
  REVERT_SALE: 'Venta revertida',
  ADJUSTMENT: 'Ajuste de metros',
  WRITE_OFF: 'Baja de inventario',
  WRITE_OFF_PENDING: 'Baja solicitada',
  WRITE_OFF_APPROVED: 'Baja aprobada',
  WRITE_OFF_REJECTED: 'Baja rechazada',
  DEFECT_DISCOUNT_PENDING: 'Defecto con descuento solicitado',
  DEFECT_DISCOUNT_APPROVED: 'Defecto con descuento aprobado',
  DEFECT_DISCOUNT_REJECTED: 'Defecto con descuento rechazado',
  DEFECT_REPLACEMENT_PENDING: 'Reposición solicitada',
  DEFECT_REPLACEMENT_APPROVED: 'Reposición aprobada',
  DEFECT_REPLACEMENT_REJECTED: 'Reposición rechazada',
  DEFECT_CLEARED: 'Marca de defecto eliminada',
  CREATE_CLIENT: 'Cliente creado',
};

export const ACTION_COLORS: Record<string, string> = {
  ENTRY: 'bg-green-100 text-green-700',
  EXIT_FULL: 'bg-red-100 text-red-700',
  EXIT_PARTIAL: 'bg-orange-100 text-orange-700',
  RETURN: 'bg-green-100 text-green-700',
  REVERT_SALE: 'bg-purple-100 text-purple-700',
  ADJUSTMENT: 'bg-blue-100 text-blue-700',
  WRITE_OFF: 'bg-gray-100 text-gray-600',
  WRITE_OFF_PENDING: 'bg-amber-100 text-amber-700',
  WRITE_OFF_APPROVED: 'bg-gray-100 text-gray-600',
  WRITE_OFF_REJECTED: 'bg-red-100 text-red-700',
  DEFECT_DISCOUNT_PENDING: 'bg-amber-100 text-amber-700',
  DEFECT_DISCOUNT_APPROVED: 'bg-orange-100 text-orange-700',
  DEFECT_DISCOUNT_REJECTED: 'bg-red-100 text-red-700',
  DEFECT_REPLACEMENT_PENDING: 'bg-amber-100 text-amber-700',
  DEFECT_REPLACEMENT_APPROVED: 'bg-purple-100 text-purple-700',
  DEFECT_REPLACEMENT_REJECTED: 'bg-red-100 text-red-700',
  DEFECT_CLEARED: 'bg-green-100 text-green-700',
  CREATE_CLIENT: 'bg-blue-100 text-blue-700',
};

const FIELD_LABELS: Record<string, string> = {
  currentMeters: 'Metros actuales',
  initialMeters: 'Metros iniciales',
  status: 'Estado del rollo',
  isRemnant: 'Es remanente',
  location: 'Ubicación',
  pricePerMeter: 'Precio/m',
  priceB2B: 'Precio B2B',
  name: 'Nombre',
  type: 'Tipo',
  rollNumber: 'No. Rollo',
  disaNumber: 'Consecutivo',
  productId: 'Producto',
  lotId: 'Lote',
  revertedMovementId: 'Movimiento revertido',
  approvalStatus: 'Estado de aprobación',
  approvedBy: 'Aprobado por',
  approvedAt: 'Fecha de aprobación',
  hasDefect: 'Defecto activo',
  defectNote: 'Nota de defecto',
  defectDiscountPct: 'Descuento por defecto',
  rejectionComment: 'Motivo de rechazo',
};

const VALUE_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  ACTIVE: 'Activo',
  DEPLETED: 'Agotado',
  REMNANT: 'Remanente',
  WRITTEN_OFF: 'Dado de baja',
  DEFECTIVE: 'Defectuoso',
  WRITE_OFF: 'Baja total',
  DEFECT_DISCOUNT: 'Defecto con descuento',
  DEFECT_REPLACEMENT: 'Defecto con reposición',
  EXIT_FULL: 'Salida completa',
  EXIT_PARTIAL: 'Corte parcial',
  ENTRY: 'Entrada',
  RETURN: 'Devolución',
};

export function translateAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatAuditField(
  key: string,
  value: unknown,
  users?: { id: number; name: string }[],
): string {
  if (value === null || value === undefined) return '—';

  if (key === 'approvedBy' && typeof value === 'number' && users) {
    const found = users.find(u => u.id === value);
    return found ? found.name : `Usuario #${value}`;
  }

  if ((key === 'approvalStatus' || key === 'status' || key === 'type') && typeof value === 'string') {
    return VALUE_LABELS[value] ?? value;
  }

  if ((key === 'isRemnant' || key === 'hasDefect') && typeof value !== 'string') {
    return value ? 'Sí' : 'No';
  }

  if (key === 'approvedAt' && typeof value === 'number') {
    return new Date(value).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  if ((key === 'pricePerMeter' || key === 'priceB2B') && typeof value === 'number') {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(value);
  }

  if (key === 'defectDiscountPct' && typeof value === 'number') {
    return `${value}%`;
  }

  return String(value);
}

export function formatAuditData(
  jsonStr: string | null,
  users?: { id: number; name: string }[],
): string {
  if (!jsonStr) return '—';
  try {
    const data = JSON.parse(jsonStr) as Record<string, unknown>;
    return Object.entries(data)
      .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${formatAuditField(k, v, users)}`)
      .join(' · ');
  } catch {
    return jsonStr;
  }
}
