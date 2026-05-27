import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Sidebar from '@/components/Sidebar';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-[#F5F5F5]">
      <Sidebar user={session} />
      <main className="flex-1 ml-14 min-h-screen">
        {children}
      </main>
    </div>
  );
}
