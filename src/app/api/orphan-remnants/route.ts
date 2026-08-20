import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canManageClients, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

// GET  /api/orphan-remnants          — list (all authenticated roles)
// POST /api/orphan-remnants          — create (OWNER + ADMIN only)

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const status = sp.get('status') ?? '';

  try {
    const dbAny = db as any;
    let query = dbAny
      .from('OrphanRemnant')
      .select('id, reference, color, estimatedMeters, width, location, notes, status, createdBy, createdAt, updatedAt')
      .order('createdAt', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ data: data ?? [] });
  } catch (err) {
    console.error('GET /api/orphan-remnants error:', err);
    return Response.json({ error: 'Error al obtener remanentes huérfanos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canManageClients(session.role as Role)) {
    return Response.json({ error: 'Solo OWNER y ADMIN pueden crear remanentes huérfanos' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { reference, color, estimatedMeters, width, location, notes } = body as {
      reference: string;
      color?: string;
      estimatedMeters: number;
      width?: number;
      location?: string;
      notes?: string;
    };

    if (!reference?.trim()) return Response.json({ error: 'Referencia es requerida' }, { status: 400 });
    if (!estimatedMeters || Number(estimatedMeters) <= 0) {
      return Response.json({ error: 'Metros estimados debe ser mayor a 0' }, { status: 400 });
    }

    const now = Date.now();
    const dbAny = db as any;

    const { data, error } = await dbAny.from('OrphanRemnant').insert({
      reference:       reference.trim(),
      color:           (color ?? '').trim(),
      estimatedMeters: Number(estimatedMeters),
      width:           Number(width ?? 0),
      location:        (location ?? '').trim(),
      notes:           notes?.trim() ?? null,
      status:          'AVAILABLE',
      createdBy:       session.userId,
      createdAt:       now,
      updatedAt:       now,
    }).select('id').single();

    if (error) throw error;
    return Response.json({ ok: true, id: data.id }, { status: 201 });
  } catch (err) {
    console.error('POST /api/orphan-remnants error:', err);
    return Response.json({ error: 'Error al crear remanente huérfano' }, { status: 500 });
  }
}
