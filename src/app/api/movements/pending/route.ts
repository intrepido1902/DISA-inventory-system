import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role !== 'OWNER') return Response.json({ error: 'Solo el socio puede ver bajas pendientes' }, { status: 403 });

  try {
    const dbAny = db as any;
    const { data, error } = await dbAny.from('Movement').select(`
      id, type, meters, notes, createdAt, approvalStatus, approvedAt,
      user:userId(name),
      approver:approvedBy(name),
      roll:rollId(
        id, disaNumber, rollNumber, currentMeters, status,
        product:productId(name, code, color, width)
      )
    `)
      .in('type', ['WRITE_OFF', 'DEFECT_DISCOUNT', 'DEFECT_REPLACEMENT'])
      .eq('approvalStatus', 'PENDING')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    return Response.json((data ?? []).map((m: any) => ({
      id: m.id,
      type: m.type,
      meters: m.meters,
      notes: m.notes,
      createdAt: m.createdAt,
      approvalStatus: m.approvalStatus,
      reportedBy: m.user?.name ?? '—',
      roll: {
        id: m.roll?.id ?? null,
        disaNumber: m.roll?.disaNumber ?? null,
        rollNumber: m.roll?.rollNumber ?? '',
        currentMeters: m.roll?.currentMeters ?? 0,
        status: m.roll?.status ?? '',
        productName: m.roll?.product?.name ?? '',
        productCode: m.roll?.product?.code ?? '',
        color: m.roll?.product?.color ?? '',
        width: m.roll?.product?.width ?? 0,
      },
    })));
  } catch (err) {
    console.error('GET /api/movements/pending error:', err);
    return Response.json({ error: 'Error al obtener bajas pendientes' }, { status: 500 });
  }
}
