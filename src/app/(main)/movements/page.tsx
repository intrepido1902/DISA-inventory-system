import { getSession } from '@/lib/session';
import { canSeeFinancials, canRevertSale, type Role } from '@/lib/auth';
import MovementsClient from './client';

export default async function MovementsPage() {
  const session = await getSession();
  const isOwner = canSeeFinancials(session!.role as Role);
  const canRevert = canRevertSale(session!.role as Role);
  return <MovementsClient isOwner={isOwner} canRevert={canRevert} />;
}
