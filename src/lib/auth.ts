import bcrypt from 'bcryptjs';
import db from './db';

export type Role = 'OWNER' | 'ADMIN' | 'WAREHOUSE';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: number;
}

export async function validateUser(email: string, password: string): Promise<User | null> {
  const result = await db.execute({
    sql: 'SELECT id, email, password, name, role, active FROM User WHERE email = ? AND active = 1',
    args: [email],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const valid = await bcrypt.compare(password, row.password as string);
  if (!valid) return null;

  return {
    id: row.id as number,
    email: row.email as string,
    name: row.name as string,
    role: row.role as Role,
    active: row.active as number,
  };
}

export async function getUserById(id: number): Promise<User | null> {
  const result = await db.execute({
    sql: 'SELECT id, email, name, role, active FROM User WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  return {
    id: row.id as number,
    email: row.email as string,
    name: row.name as string,
    role: row.role as Role,
    active: row.active as number,
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
