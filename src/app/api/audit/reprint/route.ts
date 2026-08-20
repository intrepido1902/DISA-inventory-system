import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { canSeeCatalog, type Role } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/audit/reprint?rollId=X&createdAt=Y
// Reconstructs sale + roll data for reprinting factura and etiqueta from audit log entries.
// Uses the exact createdAt timestamp (both AuditLog and Movement are written with the same `now`).

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!canSeeCatalog(session.role as Role)) {
    return Response.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const rollId    = parseInt(sp.get('rollId')    ?? '');
  const createdAt = parseInt(sp.get('createdAt') ?? '');

  if (isNaN(rollId) || isNaN(createdAt)) {
    return Response.json({ error: 'rollId y createdAt son requeridos' }, { status: 400 });
  }

  const dbAny = db as any;

  try {
    // 1. Find EXIT movement for this rollId at this exact timestamp
    //    (AuditLog and Movement both use the same Date.now() value)
    let movRes: any = await dbAny
      .from('Movement')
      .select('id, type, meters, saleId, pricePerMeter, discount')
      .eq('rollId', rollId)
      .eq('createdAt', createdAt)
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .maybeSingle();

    let mov = movRes.data;

    // Fallback: within ±10 seconds (handles any clock skew or multi-row edge case)
    if (!mov) {
      const { data: rows } = await dbAny
        .from('Movement')
        .select('id, type, meters, saleId, pricePerMeter, discount')
        .eq('rollId', rollId)
        .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
        .gte('createdAt', createdAt - 10_000)
        .lte('createdAt', createdAt + 10_000)
        .order('createdAt', { ascending: true })
        .limit(1);
      mov = rows?.[0] ?? null;
    }

    if (!mov || !mov.saleId) {
      return Response.json({ error: 'Movimiento de venta no encontrado' }, { status: 404 });
    }

    const saleId = mov.saleId as number;

    // 2. Fetch Sale record
    const { data: sale, error: saleErr } = await dbAny
      .from('Sale')
      .select('id, clientId, clientName, date, subtotal, discount, total, createdAt')
      .eq('id', saleId)
      .single();

    if (saleErr || !sale) {
      return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    // 3. Fetch all EXIT movements for this sale (all rolls included in the sale)
    const { data: saleMov } = await dbAny
      .from('Movement')
      .select(`
        id, type, meters, pricePerMeter, discount,
        roll:rollId(
          id, rollNumber, disaNumber, currentMeters, initialMeters, status,
          product:productId(id, code, name, color, width,
            category:categoryId(id, name)
          )
        )
      `)
      .eq('saleId', saleId)
      .in('type', ['EXIT_FULL', 'EXIT_PARTIAL'])
      .order('id', { ascending: true });

    if (!saleMov || saleMov.length === 0) {
      return Response.json({ error: 'Sin movimientos para esta venta' }, { status: 404 });
    }

    // 4. Fetch the specific roll for the label (current state)
    const { data: rollData } = await dbAny
      .from('Roll')
      .select(`
        id, rollNumber, disaNumber, currentMeters, initialMeters, status, updatedAt,
        product:productId(id, code, name, color, width,
          category:categoryId(id, name)
        )
      `)
      .eq('id', rollId)
      .single();

    // Build response — client will use these fields to call generateSalePDF + generateRollLabel
    const saleData = {
      saleId:     sale.id        as number,
      clientName: sale.clientName as string,
      date:       sale.date       as string,
      createdAt:  sale.createdAt  as number,
      subtotal:   sale.subtotal   as number,
      discount:   sale.discount   as number,
      total:      sale.total      as number,
    };

    const movements = (saleMov as any[]).map(m => ({
      id:           m.id           as number,
      type:         m.type         as string,
      meters:       m.meters       as number,
      pricePerMeter: m.pricePerMeter as number,
      discount:     m.discount     as number,
      roll: {
        id:           m.roll?.id           as number,
        rollNumber:   m.roll?.rollNumber   as string,
        disaNumber:   (m.roll?.disaNumber  ?? null) as string | null,
        currentMeters: m.roll?.currentMeters as number,
        initialMeters: m.roll?.initialMeters as number,
        status:       m.roll?.status       as string,
        product: {
          id:     m.roll?.product?.id     as number,
          code:   m.roll?.product?.code   as string,
          name:   m.roll?.product?.name   as string,
          color:  m.roll?.product?.color  as string,
          width:  m.roll?.product?.width  as number,
          category: {
            id:   m.roll?.product?.category?.id   as number,
            name: m.roll?.product?.category?.name as string,
          },
        },
      },
    }));

    const roll = rollData ? {
      id:           rollData.id           as number,
      rollNumber:   rollData.rollNumber   as string,
      disaNumber:   (rollData.disaNumber  ?? null) as string | null,
      currentMeters: rollData.currentMeters as number,
      initialMeters: rollData.initialMeters as number,
      status:       rollData.status       as string,
      updatedAt:    rollData.updatedAt    as number,
      product: {
        code:  rollData.product?.code  as string,
        color: rollData.product?.color as string,
        width: rollData.product?.width as number,
        category: { name: rollData.product?.category?.name as string },
      },
    } : null;

    return Response.json({ sale: saleData, movements, roll });
  } catch (err) {
    console.error('GET /api/audit/reprint error:', err);
    return Response.json({ error: 'Error al obtener datos de reimprimir' }, { status: 500 });
  }
}
