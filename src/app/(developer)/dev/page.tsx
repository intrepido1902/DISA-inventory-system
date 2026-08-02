import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import DevPanel from './DevPanel';

async function getDevData() {
  const dbAny = db as any;

  const [userCountRes, activeRollRes, usersRes, recentMovRes] = await Promise.all([
    db.from('User').select('*', { count: 'exact', head: true }),
    db.from('Roll').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    dbAny
      .from('User')
      .select('id, email, username, name, role, active, mustChangePassword, createdAt')
      .order('createdAt', { ascending: true }),
    dbAny
      .from('Movement')
      .select('id, type, createdAt, approvalStatus, user:userId(name), roll:rollId(rollNumber, product:productId(name, code))')
      .order('createdAt', { ascending: false })
      .limit(20),
  ]);

  return {
    userCount: userCountRes.count ?? 0,
    activeRolls: activeRollRes.count ?? 0,
    users: usersRes.data ?? [],
    recentMovements: recentMovRes.data ?? [],
  };
}

export default async function DevPage() {
  const session = await getSession();
  const data = await getDevData();

  return (
    <DevPanel
      developerName={session!.name}
      userCount={data.userCount}
      activeRolls={data.activeRolls}
      initialUsers={data.users}
      recentMovements={data.recentMovements}
    />
  );
}
