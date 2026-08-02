import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'DEVELOPER') {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const dbAny = db as any;

  const [
    userCountRes,
    activeRollRes,
    lastMovRes,
    recentMovRes,
  ] = await Promise.all([
    db.from('User').select('*', { count: 'exact', head: true }),
    db.from('Roll').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    dbAny.from('Movement')
      .select('id, type, createdAt, user:userId(name), roll:rollId(rollNumber, product:productId(name, code))')
      .order('createdAt', { ascending: false })
      .limit(1)
      .single(),
    dbAny.from('Movement')
      .select('id, type, createdAt, approvalStatus, user:userId(name), roll:rollId(rollNumber, product:productId(name, code))')
      .order('createdAt', { ascending: false })
      .limit(15),
  ]);

  return Response.json({
    userCount: userCountRes.count ?? 0,
    activeRolls: activeRollRes.count ?? 0,
    lastMovement: lastMovRes.data ?? null,
    recentMovements: recentMovRes.data ?? [],
  });
}
