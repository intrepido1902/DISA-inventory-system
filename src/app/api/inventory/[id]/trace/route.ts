import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

const OFFSETS: Record<string, number> = { Velo: 1001, Blackout: 1201 };
const DEFAULT_OFFSET = 2001;

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

    // Roll + product + lot
    const rollRes: any = await dbAny.from('Roll').select(`
      id, rollNumber, barcode, label_number, initialMeters, currentMeters,
      location, status, isRemnant, createdAt,
      product:productId(id, name, code, color, width,
        category:categoryId(id, name)
      ),
      lot:lotId(id, lotNumber, importDate)
    `).eq('id', rollId).single();

    if (rollRes.error || !rollRes.data) {
      return Response.json({ error: 'Rollo no encontrado' }, { status: 404 });
    }

    const r = rollRes.data;
    const categoryName: string = r.product?.category?.name ?? '';
    const categoryId: number = r.product?.category?.id ?? 0;

    // Compute consecutivo: count rolls with same category and lower id
    const prodsRes: any = await dbAny.from('Product')
      .select('id')
      .eq('categoryId', categoryId);
    const prodIds: number[] = (prodsRes.data ?? []).map((p: any) => p.id as number);

    let consecutivo: number | null = null;
    if (prodIds.length > 0) {
      const { count } = await dbAny.from('Roll')
        .select('id', { count: 'exact', head: true })
        .in('productId', prodIds)
        .lt('id', rollId);
      consecutivo = (OFFSETS[categoryName] ?? DEFAULT_OFFSET) + (count ?? 0);
    }

    // Movements chronological order
    const movRes: any = await dbAny.from('Movement').select(`
      id, type, meters, notes, createdAt,
      user:userId(name),
      sale:saleId(client:clientId(name))
    `).eq('rollId', rollId).order('createdAt', { ascending: true });

    const rawMovements: any[] = movRes.data ?? [];

    // Compute running meters after each movement
    let runningMeters = 0;
    const movements = rawMovements.map((m: any) => {
      if (m.type === 'ENTRY') {
        runningMeters = m.meters;
      } else {
        runningMeters = Math.max(0, runningMeters - m.meters);
      }
      return {
        id: m.id as number,
        fecha: m.createdAt as number,
        tipo: m.type as string,
        metrosDescontados: m.type === 'ENTRY' ? null : (m.meters as number),
        metrosRestantes: runningMeters,
        cliente: m.sale?.client?.name ?? null,
        usuario: m.user?.name ?? '',
        notas: m.notes ?? null,
      };
    });

    return Response.json({
      roll: {
        id: r.id,
        labelNumber: r.label_number ?? null,
        consecutivo,
        referencia: r.product?.code ?? null,
        producto: r.product?.name ?? null,
        color: r.product?.color ?? null,
        categoria: categoryName,
        ancho: r.product?.width ?? null,
        metrosIniciales: r.initialMeters,
        metrosActuales: r.currentMeters,
        estado: r.status,
        ubicacion: r.location,
        isRemnant: Boolean(r.isRemnant),
        rollNumber: r.rollNumber,
        barcode: r.barcode ?? null,
        createdAt: r.createdAt,
      },
      lot: {
        id: r.lot?.id ?? null,
        codigo: r.lot?.lotNumber ?? null,
        fechaImportacion: r.lot?.importDate ?? null,
      },
      movements,
    });
  } catch (err) {
    console.error('GET /api/inventory/[id]/trace error:', err);
    return Response.json({ error: 'Error al obtener trazabilidad' }, { status: 500 });
  }
}
