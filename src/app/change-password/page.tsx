import { verifyTempToken } from '@/lib/session';
import { db } from '@/lib/db';
import ChangePasswordForm from './ChangePasswordForm';

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? '';

  let firstName = '';
  if (token) {
    const verified = await verifyTempToken(token);
    if (verified) {
      const { data } = await (db as any)
        .from('User')
        .select('name')
        .eq('id', verified.userId)
        .single();
      firstName = data?.name ? (data.name as string).split(' ')[0] : '';
    }
  }

  return <ChangePasswordForm token={token} firstName={firstName} />;
}
