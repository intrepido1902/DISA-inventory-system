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
  const clientNameFilter = searchParams.get('clientName') ?? '';

  // dateFrom/dateTo arrive as ISO date strings ("2026-08-01"); createdAt is a bigint epoch-ms
  // column. Force UTC boundaries explicitly — new Date(dateFrom).setHours(...) interprets the
  // time in the server process's local timezone, which shifts the range depending on where/how
  // the server runs.
  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).getTime() : null;
  console.log('[audit/route] date range:', { dateFrom, dateTo, fromMs, toMs });

  try {
    let query = db.from('AuditLog').select(`
      id, action, entity, entityId, oldData, newData, createdAt,
      user:userId(name, email)
    `);

    if (actionFilter) query = query.eq('action', actionFilter);
    if (userIdFilter) query = query.eq('userId', Number(userIdFilter));
    if (fromMs) query = query.gte('createdAt', fromMs);
    if (toMs) query = query.lte('createdAt', toMs);

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

    // clientName comes from the Sale-based enrichment, not from AuditLog itself, so it can only
    // be filtered in-memory after enrichAuditLogs runs — not as part of the AuditLog query above.
    const filtered = clientNameFilter
      ? enriched.filter(l => l.clientName?.toLowerCase().includes(clientNameFilter.toLowerCase()))
      : enriched;

    return Response.json({ logs: filtered, users: usersRes.data ?? [] });
  } catch (err) {
    console.error('GET /api/audit error:', err);
    return Response.json({ error: 'Error al obtener auditoría' }, { status: 500 });
  }
}
