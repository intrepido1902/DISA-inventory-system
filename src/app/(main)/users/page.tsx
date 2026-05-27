import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import db from '@/lib/db';

async function getUsers() {
  const result = await db.execute(
    'SELECT id, email, name, role, active, createdAt FROM User ORDER BY createdAt ASC'
  );
  return result.rows;
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Socio', ADMIN: 'Administrador', WAREHOUSE: 'Bodega',
};
const ROLE_CLASS: Record<string, string> = {
  OWNER: 'bg-amber-100 text-amber-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  WAREHOUSE: 'bg-green-100 text-green-700',
};

export default async function UsersPage() {
  const session = await getSession();
  if (session!.role !== 'OWNER') redirect('/dashboard');

  const users = await getUsers();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Usuarios</h1>
        <p className="text-sm text-gray-500 mt-0.5">{users.length} usuarios del sistema</p>
      </div>

      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left">Correo</th>
                <th className="px-5 py-3 text-left">Rol</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-left">Registrado</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id as number} className="border-b border-[#F5F5F5] hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0">
                        {(u.name as string).split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{u.name as string}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.email as string}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_CLASS[u.role as string] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[u.role as string] ?? u.role as string}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {new Date(u.createdAt as number).toLocaleDateString('es-CO')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
