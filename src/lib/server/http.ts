import 'server-only';
import { ZodError } from 'zod';
import { ConflictError } from './storage';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function checkOrigin(request: Request) {
  const allowed = (process.env.APP_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowed.length) throw new Error('APP_ORIGINS is not configured');
  if (!allowed.includes(request.headers.get('origin') || '') || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Запрос отклонён. Откройте админку на сайте заново.');
}
export async function limitedBody(request: Pick<Request, 'headers' | 'body'>, maxBytes: number): Promise<Uint8Array> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Файл или запрос слишком большой');
  if (!request.body) throw new HttpError(400, 'Пустой запрос');
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Файл или запрос слишком большой'); } parts.push(value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
export async function readJson(request: Request, limit = 256000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Ожидается JSON');
  try { return JSON.parse(Buffer.from(await limitedBody(request, limit)).toString()); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Некорректные данные'); }
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ConflictError) return json({ error: 'Меню или сеанс уже изменены в другой вкладке. Обновите данные перед сохранением.' }, 409);
  if (error instanceof ZodError) return json({ error: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).slice(0, 3).join('; ') }, 400);
  // Log only error class, never request bodies, passwords, or storage credentials.
  console.error('CMS request failed:', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: 'Не удалось обратиться к хранилищу. Изменения не подтверждены. Проверьте подключение и обновите данные.' }, 503);
}
