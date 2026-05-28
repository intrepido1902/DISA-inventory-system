import bcrypt from 'bcryptjs';
import { db } from './db';

export type Role = 'OWNER' | 'ADMIN' | 'WAREHOUSE';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: number;
}

export async function validateUser(email: string, password: string): Promise<User | null> {
  const { data, error } = await db
    .from('User')
    .select('id, email, password, name, role, active')
    .eq('email', email)
    .eq('active', 1)
    .single();

  if (error || !data) return null;

  const valid = await bcrypt.compare(password, (data as any).password as string);
  if (!valid) return null;

  const d = data as any;
  return {
    id: d.id as number,
    email: d.email as string,
    name: d.name as string,
    role: d.role as Role,
    active: d.active as number,
  };
}

export async function getUserById(id: number): Promise<User | null> {
  const { data, error } = await db
    .from('User')
    .select('id, email, name, role, active')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  const d = data as any;
  return {
    id: d.id as number,
    email: d.email as string,
    name: d.name as string,
    role: d.role as Role,
    active: d.active as number,
  };
}

export function canSeeFinancials(role: Role): boolean {
  return role === 'OWNER';
}

export function canManageInventory(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canRegisterMovement(_role: Role): boolean {
  return true;
}

export function canManageClients(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canSeeCatalog(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
