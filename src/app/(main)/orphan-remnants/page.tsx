import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import OrphanRemnantsClient from './client';

async function getOrphanRemnants() {
  const dbAny = db as any;
  const { data } = await dbAny
    .from('OrphanRemnant')
    .select('id, reference, color, estimatedMeters, width, location, notes, status, createdBy, createdAt, updatedAt')
    .order('createdAt', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id:              r.id              as number,
    reference:       r.reference       as string,
    color:           r.color           as string,
    estimatedMeters: r.estimatedMeters as number,
    width:           r.width           as number,
    location:        r.location        as string,
    notes:           (r.notes          ?? null) as string | null,
    status:          r.status          as string,
    createdBy:       r.createdBy       as number | null,
    createdAt:       r.createdAt       as number,
    updatedAt:       r.updatedAt       as number,
  }));
}

export default async function OrphanRemnantsPage() {
  const session = await getSession();
  const items = await getOrphanRemnants();
  const canEdit = session!.role === 'OWNER' || session!.role === 'ADMIN';
  const isOwner = session!.role === 'OWNER';
  return <OrphanRemnantsClient items={items} canEdit={canEdit} isOwner={isOwner} />;
}
