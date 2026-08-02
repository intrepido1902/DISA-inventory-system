import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== 'DEVELOPER') redirect('/login');
  return <>{children}</>;
}
