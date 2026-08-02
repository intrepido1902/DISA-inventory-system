import bcrypt from 'bcryptjs';
import { db } from './db';

export type Role = 'OWNER' | 'ADMIN' | 'WAREHOUSE' | 'DEVELOPER';

export interface User {
  id: number;
  email: string;
  username: string | null;
  name: string;
  role: Role;
  active: number;
  mustChangePassword: boolean;
}

export async function validateUser(username: string, password: string): Promise<User | null> {
  const { data, error } = await db
    .from('User')
    .select('id, email, username, password, name, role, active, mustChangePassword')
    .eq('username', username)
    .eq('active', 1)
    .single();

  if (error || !data) return null;

  const valid = await bcrypt.compare(password, (data as any).password as string);
  if (!valid) return null;

  const d = data as any;
  return {
    id: d.id as number,
    email: d.email as string,
    username: d.username as string | null,
    name: d.name as string,
    role: d.role as Role,
    active: d.active as number,
    mustChangePassword: Boolean(d.mustChangePassword),
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
    username: null,
    name: d.name as string,
    role: d.role as Role,
    active: d.active as number,
    mustChangePassword: Boolean(d.mustChangePassword),
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

export function canRevertSale(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canSeeCatalog(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
