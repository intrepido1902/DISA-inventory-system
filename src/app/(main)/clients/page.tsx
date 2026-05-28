import { getSession } from '@/lib/session';
import { canManageClients, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

const TYPE_LABEL: Record<string, string> = { DISTRIBUTOR: 'Distribuidor', DECORATOR: 'Decorador' };
const TYPE_CLASS: Record<string, string> = { DISTRIBUTOR: 'bg-blue-50 text-blue-700', DECORATOR: 'bg-purple-50 text-purple-700' };

export default async function ClientsPage() {
  const session = await getSession();
  if (!canManageClients(session!.role as Role)) redirect('/dashboard');

  const { data: clients } = await db.from('Client').select('id, name, type, phone, email, notes, active, createdAt').order('name', { ascending: true });

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">{(clients ?? []).length} clientes registrados</p>
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-left">Teléfono</th>
                <th className="px-5 py-3 text-left">Correo</th>
                <th className="px-5 py-3 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">No hay clientes registrados</td></tr>
              ) : (
                (clients ?? []).map((c: any) => (
                  <tr key={c.id} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_CLASS[c.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[c.type] ?? c.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 tabular-nums">{c.phone ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{c.email ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs max-w-xs truncate">{c.notes ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
