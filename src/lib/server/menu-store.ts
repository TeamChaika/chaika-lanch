import 'server-only';
import { randomUUID } from 'node:crypto';
import { defaultCatalog, type MenuCatalog } from '@/data/menu';
import { validateCatalog } from '@/lib/menu-schema';
import { ConflictError, readObject, writeObject } from './storage';

const menuKey = 'cms/menu.json';
export async function readMenu() {
  const stored = await readObject(menuKey);
  return { catalog: stored ? validateCatalog(JSON.parse(stored.body)) : structuredClone(defaultCatalog), etag: stored?.etag ?? null };
}
export async function publishMenu(input: unknown): Promise<MenuCatalog> {
  const incoming = validateCatalog(input);
  const current = await readMenu();
  if (incoming.revision !== current.catalog.revision) throw new ConflictError();
  const next = { ...incoming, revision: randomUUID(), updatedAt: new Date().toISOString() };
  // Published snapshots contain menu content only; credentials never enter this document.
  await writeObject(`cms/history/${current.catalog.revision}.json`, JSON.stringify(current.catalog));
  await writeObject(menuKey, JSON.stringify(next), { expected: current.etag });
  return next;
}
