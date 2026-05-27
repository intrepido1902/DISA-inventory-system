import { getSession } from '@/lib/session';
import { canManageInventory } from '@/lib/auth';
import { redirect } from 'next/navigation';
import db from '@/lib/db';

async function getClients() {
  const result = await db.execute(
    'SELECT id, name, type, phone, email, notes, active, createdAt FROM Client ORDER BY name'
  );
  return result.rows;
}

const TYPE_LABEL: Record<string, string> = { DISTRIBUTOR: 'Distribuidor', DECORATOR: 'Decorador' };
const TYPE_CLASS: Record<string, string> = {
  DISTRIBUTOR: 'bg-blue-50 text-blue-700',
  DECORATOR: 'bg-purple-50 text-purple-700',
};

export default async function ClientsPage() {
  const session = await getSession();
  if (!canManageInventory(session!.role as 'OWNER' | 'WAREHOUSE')) {
    redirect('/dashboard');
  }

  const clients = await getClients();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">{clients.length} clientes registrados</p>
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    No hay clientes registrados
                  </td>
                </tr>
              ) : (
                clients.map(c => (
                  <tr key={c.id as number} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{c.name as string}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_CLASS[c.type as string] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[c.type as string] ?? c.type as string}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 tabular-nums">{c.phone as string ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{c.email as string ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs max-w-xs truncate">{c.notes as string ?? '—'}</td>
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
