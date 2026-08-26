import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

const ALLOWED_TYPES = ['WRITE_OFF', 'DEFECT_DISCOUNT', 'DEFECT_REPLACEMENT'] as const;
type DefectType = typeof ALLOWED_TYPES[number];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await request.json();
    const { rollId, type, notes, defectDiscountPct } = body as {
      rollId?: number; type?: string; notes?: string; defectDiscountPct?: number | null;
    };

    if (!rollId) return Response.json({ error: 'rollId es requerido' }, { status: 400 });
    if (!ALLOWED_TYPES.includes(type as DefectType)) {
      return Response.json({ error: 'Tipo inválido. Usa WRITE_OFF, DEFECT_DISCOUNT o DEFECT_REPLACEMENT' }, { status: 400 });
    }
    if (type === 'DEFECT_DISCOUNT' && (!defectDiscountPct || Number(defectDiscountPct) <= 0)) {
      return Response.json({ error: 'El % de descuento es requerido para DEFECT_DISCOUNT' }, { status: 400 });
    }

    const dbAny = db as any;
    const rollRes: any = await dbAny.from('Roll').select('id, currentMeters, status').eq('id', Number(rollId)).single();
    if (rollRes.error || !rollRes.data) return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });

    const roll = rollRes.data;
    if (roll.status === 'WRITTEN_OFF' || roll.status === 'DEPLETED') {
      return Response.json({ error: 'El rollo no está disponible para reportar baja' }, { status: 400 });
    }

    const now = Date.now();

    // OWNER/ADMIN can register a write-off/defect immediately, no approval flow.
    // WAREHOUSE still goes through the PENDING → OWNER approves/rejects flow.
    const autoApprove = session.role === 'OWNER' || session.role === 'ADMIN';

    const movRes: any = await dbAny.from('Movement').insert({
      type,
      rollId: Number(rollId),
      meters: roll.currentMeters,
      userId: session.userId,
      notes: notes?.trim() || null,
      barcodeUsed: 0,
      approvalStatus: autoApprove ? 'APPROVED' : 'PENDING',
      approvedBy: autoApprove ? session.userId : null,
      approvedAt: autoApprove ? now : null,
      defectDiscountPct: type === 'DEFECT_DISCOUNT' ? (Number(defectDiscountPct) || null) : null,
      createdAt: now,
    }).select('id').single();

    if (movRes.error) {
      console.error('Defect insert error:', movRes.error);
      return Response.json({ error: 'Error al registrar la baja' }, { status: 500 });
    }

    if (autoApprove) {
      // Apply the roll state change immediately — same effect as the OWNER approval endpoint.
      if (type === 'WRITE_OFF') {
        // The Movement's `meters` is the roll's full currentMeters at write-off time (set above),
        // so the roll always drains to 0 — same as the OWNER approval endpoint.
        await dbAny.from('Roll').update({
          status: 'WRITTEN_OFF',
          currentMeters: 0,
          isRemnant: 0,
          updatedAt: now,
        }).eq('id', Number(rollId));
      } else if (type === 'DEFECT_REPLACEMENT') {
        await dbAny.from('Roll').update({
          status: 'DEFECTIVE',
          updatedAt: now,
        }).eq('id', Number(rollId));
      } else if (type === 'DEFECT_DISCOUNT') {
        await dbAny.from('Roll').update({
          hasDefect: true,
          defectNote: notes?.trim() || null,
          defectDiscountPct: Number(defectDiscountPct) || null,
          updatedAt: now,
        }).eq('id', Number(rollId));
      }
    }

    await dbAny.from('AuditLog').insert({
      userId: session.userId,
      action: autoApprove ? `${type}_APPROVED` : `${type}_PENDING`,
      entity: 'Roll',
      entityId: Number(rollId),
      oldData: JSON.stringify({ status: roll.status, currentMeters: roll.currentMeters }),
      newData: JSON.stringify({
        approvalStatus: autoApprove ? 'APPROVED' : 'PENDING',
        ...(autoApprove ? { approvedBy: session.userId } : {}),
        type, defectDiscountPct: defectDiscountPct ?? null,
      }),
      createdAt: now,
    });

    return Response.json({ ok: true, movementId: movRes.data.id, autoApproved: autoApprove });
  } catch (err) {
    console.error('POST /api/inventory/defect error:', err);
    return Response.json({ error: 'Error al registrar la baja' }, { status: 500 });
  }
}
