import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LayoutWrapper from '@/components/LayoutWrapper';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <LayoutWrapper user={session}>
      {children}
    </LayoutWrapper>
  );
}
