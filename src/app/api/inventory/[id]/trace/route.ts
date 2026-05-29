import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const rollId = Number(id);
  if (isNaN(rollId)) return Response.json({ error: 'ID inválido' }, { status: 400 });

  try {
    const dbAny = db as any;

    const rollRes: any = await dbAny.from('Roll').select(`
      id, rollNumber, barcode, disaNumber, initialMeters, currentMeters,
      location, status, isRemnant, createdAt,
      product:productId(id, name, code, color, width,
        category:categoryId(id, name)
      ),
      lot:lotId(id, lotNumber, importDate, supplier)
    `).eq('id', rollId).single();

    if (rollRes.error || !rollRes.data) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const r = rollRes.data;

    const movRes: any = await dbAny.from('Movement').select(`
      id, type, meters, notes, createdAt,
      user:userId(name),
      sale:saleId(client:clientId(name))
    `).eq('rollId', rollId).order('createdAt', { ascending: true });

    const rawMovements: any[] = movRes.data ?? [];

    let runningMeters = 0;
    const movements = rawMovements.map((m: any) => {
      if (m.type === 'ENTRY') {
        runningMeters = m.meters as number;
      } else {
        runningMeters = Math.max(0, runningMeters - (m.meters as number));
      }
      return {
        id: m.id as number,
        fecha: m.createdAt as number,
        tipo: m.type as string,
        metros: m.meters as number,
        metrosRestantes: runningMeters,
        cliente: m.sale?.client?.name ?? null,
        usuario: m.user?.name ?? '',
        notas: m.notes ?? null,
      };
    });

    return Response.json({
      roll: {
        id: r.id,
        disaNumber: r.disaNumber ?? null,
        rollNumber: r.rollNumber,
        referencia: r.product?.code ?? null,
        producto: r.product?.name ?? null,
        color: r.product?.color ?? null,
        categoria: r.product?.category?.name ?? null,
        ancho: r.product?.width ?? null,
        metrosIniciales: r.initialMeters,
        metrosActuales: r.currentMeters,
        estado: r.status,
        ubicacion: r.location,
        isRemnant: Boolean(r.isRemnant),
        barcode: r.barcode ?? null,
        createdAt: r.createdAt,
      },
      lot: {
        lotNumber: r.lot?.lotNumber ?? null,
        importDate: r.lot?.importDate ?? null,
        supplier: r.lot?.supplier ?? null,
      },
      movements,
    });
  } catch (err) {
    console.error('GET /api/inventory/[id]/trace error:', err);
    return Response.json({ error: 'Error al obtener trazabilidad' }, { status: 500 });
  }
}
