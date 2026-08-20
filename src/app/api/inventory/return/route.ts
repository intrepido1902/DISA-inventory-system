import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

// POST /api/inventory/return
// Body: { rollId: number; meters: number; notes: string }
// Auth: OWNER | ADMIN only
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
    return Response.json({ error: 'Sin permiso' }, { status: 403 });
  }

  let body: { rollId?: unknown; meters?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const rollId  = typeof body.rollId  === 'number' ? body.rollId  : parseInt(String(body.rollId  ?? ''));
  const meters  = typeof body.meters  === 'number' ? body.meters  : parseFloat(String(body.meters ?? ''));
  const notes   = typeof body.notes   === 'string' ? body.notes.trim() : '';

  if (isNaN(rollId) || rollId <= 0)    return Response.json({ error: 'rollId inválido' },  { status: 400 });
  if (isNaN(meters) || meters <= 0)    return Response.json({ error: 'meters inválido' },   { status: 400 });
  if (!notes)                          return Response.json({ error: 'Notas obligatorias' }, { status: 400 });

  const dbAny = db as any;

  // ── Fetch roll ────────────────────────────────────────────────────────────
  const { data: roll, error: rollErr } = await dbAny.from('Roll').select(
    'id, rollNumber, disaNumber, initialMeters, currentMeters, status, isRemnant, ' +
    'product:productId(id, name, code, color, width, category:categoryId(id, name))'
  ).eq('id', rollId).single();

  if (rollErr || !roll) {
    return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
  }

  // ── Validate returnable meters ────────────────────────────────────────────
  const maxReturnable = (roll.initialMeters as number) - (roll.currentMeters as number);
  if (maxReturnable <= 0) {
    return Response.json({ error: 'El rollo ya está al máximo de metros' }, { status: 400 });
  }
  if (meters > maxReturnable) {
    return Response.json({
      error: `Máximo a devolver: ${maxReturnable} m (inicial ${roll.initialMeters} − actual ${roll.currentMeters})`,
    }, { status: 400 });
  }

  const now = Date.now();
  const newMeters = (roll.currentMeters as number) + meters;

  // Determine new status:
  // If newMeters reaches initialMeters → ACTIVE
  // If partial → REMNANT
  const newStatus   = newMeters >= (roll.initialMeters as number) ? 'ACTIVE' : 'REMNANT';
  const newIsRemnant = newStatus === 'REMNANT' ? 1 : 0;

  try {
    // ── Update Roll ────────────────────────────────────────────────────────
    const { error: updateErr } = await dbAny.from('Roll').update({
      currentMeters: newMeters,
      status: newStatus,
      isRemnant: newIsRemnant,
      updatedAt: now,
    }).eq('id', rollId);
    if (updateErr) throw updateErr;

    // ── Insert RETURN movement ─────────────────────────────────────────────
    const { error: movErr } = await dbAny.from('Movement').insert({
      type: 'RETURN',
      rollId,
      meters,
      userId: session.userId,
      saleId: null,
      notes,
      barcodeUsed: 0,
      pricePerMeter: 0,
      createdAt: now,
    });
    if (movErr) throw movErr;

    // ── Insert AuditLog ───────────────────────────────────────────────────
    await dbAny.from('AuditLog').insert({
      action: 'RETURN',
      rollId,
      userId: session.userId,
      detail: `Re-ingreso de ${meters} m. Motivo: ${notes}. Metros: ${roll.currentMeters} → ${newMeters}. Estado: ${roll.status} → ${newStatus}`,
      createdAt: now,
    });

    return Response.json({
      ok: true,
      rollId,
      metersReturned: meters,
      newMeters,
      newStatus,
      roll: {
        consecutivo: (roll.disaNumber as string | null) ?? String(rollId),
        referencia: (() => {
          const code = (roll.product?.code as string) ?? '';
          const parts = code.split('-');
          const isBlackout = (roll.product?.category?.name as string ?? '').toLowerCase() === 'blackout';
          return isBlackout ? `${parts[0]}-${parts[1] ?? ''}` : parts[0];
        })(),
        color: (() => {
          const color = roll.product?.color as string ?? '';
          const isBlackout = (roll.product?.category?.name as string ?? '').toLowerCase() === 'blackout';
          if (!isBlackout) return color;
          const MAP: Record<string, string> = {
            '1': 'Blanco', '2': 'Negro', '3': 'Gris Claro', '4': 'Gris Oscuro',
            '5': 'Beige', '6': 'Arena', '7': 'Café', '8': 'Azul Marino',
          };
          return MAP[color.trim()] ?? `Color ${color}`;
        })(),
        anchoStr: roll.product?.width ? `${roll.product.width} cm` : '—',
        metrosIniciales: roll.initialMeters as number,
      },
    });
  } catch (err: any) {
    console.error('POST /api/inventory/return error:', err);
    return Response.json({ error: err?.message ?? 'Error al registrar devolución' }, { status: 500 });
  }
}
