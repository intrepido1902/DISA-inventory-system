import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { db } from '@/lib/db';
import { enrichAuditLogs } from '@/lib/auditEnrich';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canSeeCatalog(session.role as Role)) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const actionFilter = searchParams.get('action') ?? '';
  const userIdFilter = searchParams.get('userId') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';

  try {
    let query = db.from('AuditLog').select(`
      id, action, entity, entityId, oldData, newData, createdAt,
      user:userId(name, email)
    `);

    if (actionFilter) query = query.eq('action', actionFilter);
    if (userIdFilter) query = query.eq('userId', Number(userIdFilter));
    if (dateFrom) query = query.gte('createdAt', new Date(dateFrom).setHours(0, 0, 0, 0));
    if (dateTo) query = query.lte('createdAt', new Date(dateTo).setHours(23, 59, 59, 999));

    const [logsRes, usersRes] = await Promise.all([
      query.order('createdAt', { ascending: false }).limit(500),
      db.from('User').select('id, name').order('name', { ascending: true }),
    ]);

    if (logsRes.error) throw logsRes.error;

    const logs = (logsRes.data ?? []).map((l: any) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      oldData: l.oldData,
      newData: l.newData,
      createdAt: l.createdAt,
      userName: l.user?.name ?? '',
      userEmail: l.user?.email ?? '',
    }));

    const enriched = await enrichAuditLogs(logs);
    console.log('[audit/route] enriched[0]:', JSON.stringify({ clientName: enriched[0]?.clientName, saleTotal: enriched[0]?.saleTotal }));

    return Response.json({ logs: enriched, users: usersRes.data ?? [] });
  } catch (err) {
    console.error('GET /api/audit error:', err);
    return Response.json({ error: 'Error al obtener auditoría' }, { status: 500 });
  }
}
