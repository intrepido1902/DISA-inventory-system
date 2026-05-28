import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import AuditClient from './client';

async function getAuditData() {
  const [logsRes, usersRes] = await Promise.all([
    db.from('AuditLog').select(`
      id, action, entity, entityId, oldData, newData, createdAt,
      user:userId(name, email)
    `).order('createdAt', { ascending: false }).limit(500),
    db.from('User').select('id, name').order('name', { ascending: true }),
  ]);

  return {
    logs: (logsRes.data ?? []).map((l: any) => ({
      id: l.id as number,
      action: l.action as string,
      entity: l.entity as string,
      entityId: l.entityId as number,
      oldData: l.oldData as string | null,
      newData: l.newData as string | null,
      createdAt: l.createdAt as number,
      userName: l.user?.name as string ?? '',
      userEmail: l.user?.email as string ?? '',
    })),
    users: (usersRes.data ?? []).map((r: any) => ({ id: r.id as number, name: r.name as string })),
  };
}

export default async function AuditPage() {
  const session = await getSession();
  if (!canSeeCatalog(session!.role as Role)) redirect('/dashboard');
  const { logs, users } = await getAuditData();
  return <AuditClient logs={logs} users={users} />;
}
