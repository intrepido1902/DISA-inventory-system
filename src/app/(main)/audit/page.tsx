import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import AuditClient from './client';

async function getAuditData() {
  const [logsResult, usersResult] = await Promise.all([
    pool.query(`
      SELECT
        a.id, a.action, a.entity, a."entityId", a."oldData", a."newData", a."createdAt",
        u.name as "userName", u.email as "userEmail"
      FROM "AuditLog" a
      JOIN "User" u ON a."userId" = u.id
      ORDER BY a."createdAt" DESC
      LIMIT 500
    `),
    pool.query(`SELECT id, name FROM "User" ORDER BY name`),
  ]);

  return {
    logs: logsResult.rows.map(r => ({
      id: r.id as number,
      action: r.action as string,
      entity: r.entity as string,
      entityId: r.entityId as number,
      oldData: r.oldData as string | null,
      newData: r.newData as string | null,
      createdAt: r.createdAt as number,
      userName: r.userName as string,
      userEmail: r.userEmail as string,
    })),
    users: usersResult.rows.map(r => ({ id: r.id as number, name: r.name as string })),
  };
}

export default async function AuditPage() {
  const session = await getSession();
  if (!canSeeCatalog(session!.role as Role)) redirect('/dashboard');

  const { logs, users } = await getAuditData();

  return <AuditClient logs={logs} users={users} />;
}
