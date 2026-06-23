import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (session.role === 'OWNER') return Response.json([]);

  try {
    const dbAny = db as any;
    const res: any = await dbAny
      .from('Movement')
      .select(`
        id, type, notes, createdAt, rejectionComment, approvedAt,
        roll:rollId(id, disaNumber, rollNumber, product:productId(name, code, color, width)),
        approver:approvedBy(name)
      `)
      .eq('userId', session.userId)
      .eq('approvalStatus', 'REJECTED')
      .eq('rejectionSeen', false)
      .order('approvedAt', { ascending: false });

    if (res.error) throw res.error;

    const data = (res.data ?? []).map((m: any) => ({
      id: m.id as number,
      type: m.type as string,
      notes: (m.notes ?? null) as string | null,
      rejectionComment: (m.rejectionComment ?? null) as string | null,
      createdAt: m.createdAt as number,
      approvedAt: (m.approvedAt ?? null) as number | null,
      approverName: (m.approver?.name ?? null) as string | null,
      roll: {
        id: (m.roll?.id ?? null) as number | null,
        disaNumber: (m.roll?.disaNumber ?? null) as string | null,
        rollNumber: (m.roll?.rollNumber ?? '') as string,
        productName: (m.roll?.product?.name ?? '') as string,
        productCode: (m.roll?.product?.code ?? '') as string,
        color: (m.roll?.product?.color ?? '') as string,
        width: (m.roll?.product?.width ?? 0) as number,
      },
    }));

    return Response.json(data);
  } catch (err) {
    console.error('GET /api/movements/my-rejected error:', err);
    return Response.json({ error: 'Error al obtener rechazos' }, { status: 500 });
  }
}
