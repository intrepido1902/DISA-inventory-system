import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canManageClients, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

// PATCH  /api/orphan-remnants/[id]   — update (OWNER + ADMIN)
// DELETE /api/orphan-remnants/[id]   — delete (OWNER only)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canManageClients(session.role as Role)) {
    return Response.json({ error: 'Solo OWNER y ADMIN pueden editar remanentes huérfanos' }, { status: 403 });
  }

  const { id } = await params;
  const recordId = Number(id);
  if (isNaN(recordId)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const body = await request.json();
    const { reference, color, estimatedMeters, width, location, notes, status } = body as {
      reference?: string;
      color?: string;
      estimatedMeters?: number;
      width?: number;
      location?: string;
      notes?: string;
      status?: string;
    };

    const VALID_STATUS = ['AVAILABLE', 'SOLD', 'DISCARDED'];
    if (status && !VALID_STATUS.includes(status)) {
      return Response.json({ error: `Estado inválido. Debe ser: ${VALID_STATUS.join(', ')}` }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (reference !== undefined) updates.reference = reference.trim();
    if (color     !== undefined) updates.color     = color.trim();
    if (estimatedMeters !== undefined) updates.estimatedMeters = Number(estimatedMeters);
    if (width     !== undefined) updates.width     = Number(width);
    if (location  !== undefined) updates.location  = location.trim();
    if (notes     !== undefined) updates.notes     = notes.trim() || null;
    if (status    !== undefined) updates.status    = status;

    const dbAny = db as any;
    const { error } = await dbAny.from('OrphanRemnant').update(updates).eq('id', recordId);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/orphan-remnants/[id] error:', err);
    return Response.json({ error: 'Error al actualizar remanente huérfano' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') {
    return Response.json({ error: 'Solo OWNER puede eliminar remanentes huérfanos' }, { status: 403 });
  }

  const { id } = await params;
  const recordId = Number(id);
  if (isNaN(recordId)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const dbAny = db as any;
    const { error } = await dbAny.from('OrphanRemnant').delete().eq('id', recordId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/orphan-remnants/[id] error:', err);
    return Response.json({ error: 'Error al eliminar remanente huérfano' }, { status: 500 });
  }
}
