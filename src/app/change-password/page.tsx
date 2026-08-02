import ChangePasswordForm from './ChangePasswordForm';

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return <ChangePasswordForm token={sp.token ?? ''} />;
}
