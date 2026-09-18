import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { findMeal, isMealAvailable } from '@/data/menu';
import { site } from '@/data/site';
import { deliveryDays, itemKey, weeklyGiftStatus } from '@/lib/order';
import { paymentInput, type PaymentView } from '@/lib/payments';
import { readMenu } from './menu-store';
import { ConflictError, readObject, writeObject } from './storage';
import { HttpError, json } from './http';
import { createQr, ProviderError, readQrStatus, sandboxEnabled } from './qrmanager';

const cookieName = 'chaika_checkout';
const lifetime = 7 * 86400;
interface Record extends PaymentView { purpose: 'sandbox-payment'; owner: string; fingerprint: string; createdAt: number; checkedAt: number; operationId?: string }
function password() { const value = process.env.SESSION_SECRET; if (!value || value.length < 32) throw new Error('Missing secret'); return `${value}:qrm-sandbox`; }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const key = (id: string) => `cms/payments/sandbox/${z.uuid().parse(id)}.sealed`;
async function seal(value: unknown) { return sealData(value, { password: password(), ttl: 0 }); }
async function read(id: string) {
  const object = await readObject(key(id));
  if (!object) return null;
  const value = await unsealData<Record>(object.body, { password: password(), ttl: 0 });
  if (value.purpose !== 'sandbox-payment' || value.id !== id) throw new Error('Invalid payment record');
  return { value, etag: object.etag };
}
async function save(value: Record, etag: string | null) { await writeObject(key(value.id), await seal(value), { expected: etag, type: 'application/octet-stream' }); }
export async function checkoutSession(create = false) {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) {
    const data = await unsealData<{ purpose?: string; id?: string }>(token, { password: password(), ttl: lifetime });
    if (data.purpose === 'checkout' && z.uuid().safeParse(data.id).success) return digest(data.id!);
  }
  if (!create) throw new HttpError(401, 'Откройте оформление в том же браузере. Сеанс оплаты истёк.');
  const id = randomUUID();
  jar.set(cookieName, await sealData({ purpose: 'checkout', id }, { password: password(), ttl: lifetime }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: lifetime,
  });
  return digest(id);
}
export async function paymentRateLimit(owner: string) {
  // Persistent global limit also bounds cookie-reset abuse. Values contain no personal data.
  for (const [name, limit, windowMs] of [['global', 60, 60000], [owner, 8, 600000]] as const) {
    const storageKey = `cms/payments/limits/${name}.json`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await readObject(storageKey);
      const previous = current ? JSON.parse(current.body) as { start: number; count: number } : { start: 0, count: 0 };
      const next = Date.now() - previous.start >= windowMs ? { start: Date.now(), count: 1 } : { ...previous, count: previous.count + 1 };
      if (next.count > limit) throw new HttpError(429, 'Слишком много тестовых платежей. Попробуйте позже.');
      try { await writeObject(storageKey, JSON.stringify(next), { expected: current?.etag ?? null }); break; }
      catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
    }
  }
}
export function webhookToken(id: string) { return createHmac('sha256', password()).update(`qrm-webhook:${id}`).digest('hex'); }
export function verifyWebhook(id: string, token: string) { return /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(webhookToken(id), 'hex')); }
export async function ownedPayment(id: string) {
  const owner = await checkoutSession(); const current = await read(id);
  if (!current || current.value.owner !== owner) throw new HttpError(404, 'Тестовый платёж не найден в этом браузере.');
  return current.value;
}
export function publicPayment(record: Record): PaymentView {
  return { id: record.id, state: record.state === 'creating' && Date.now() - record.createdAt > 30000 ? 'unknown' : record.state,
    items: record.items, total: record.total, delivery: record.delivery, gift: record.gift,
    qrImage: record.qrImage, paymentUrl: record.paymentUrl, number: record.number };
}
export async function createPayment(input: unknown, origin: string) {
  if (!sandboxEnabled()) throw new HttpError(503, 'Тестовая оплата пока не настроена.');
  const data = paymentInput.parse(input); const owner = await checkoutSession();
  data.items.sort((a, b) => itemKey(a).localeCompare(itemKey(b)));
  const fingerprint = digest(JSON.stringify({ items: data.items, expectedTotal: data.expectedTotal }));
  const existing = await read(data.id);
  if (existing) {
    if (existing.value.owner !== owner || existing.value.fingerprint !== fingerprint) throw new HttpError(409, 'Эта попытка оплаты уже использована. Обновите оформление.');
    return publicPayment(existing.value);
  }
  const { catalog } = await readMenu();
  const allowed = new Set(deliveryDays(new Date(), catalog).map((day) => day.value));
  if (new Set(data.items.map(itemKey)).size !== data.items.length || data.items.some((item) => !allowed.has(item.date) || !isMealAvailable(item.mealId, item.date, catalog))) throw new HttpError(409, 'Меню или доступные дни изменились. Обновите корзину.');
  const items = data.items.map((item) => { const meal = findMeal(item.mealId, catalog)!; return { ...item, name: meal.name, price: meal.price }; });
  const delivery = new Set(items.map((item) => item.date)).size * site.deliveryFee;
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, delivery);
  if (total * 100 !== data.expectedTotal || total > 1000000) throw new HttpError(409, 'Сумма заказа изменилась. Обновите корзину перед оплатой.');
  await paymentRateLimit(owner);
  const record: Record = { id: data.id, purpose: 'sandbox-payment', owner, fingerprint, createdAt: Date.now(), checkedAt: 0, state: 'creating', items, delivery, total, gift: weeklyGiftStatus(items).eligible };
  try { await save(record, null); }
  catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const winner = await ownedPayment(data.id);
    if (winner.fingerprint !== fingerprint) throw new HttpError(409, 'Эта попытка оплаты уже использована.');
    return publicPayment(winner);
  }
  const reserved = (await read(data.id))!;
  try {
    const result = await createQr({ sum: total * 100, payment_purpose: `Чайка Обеды · ТЕСТ · ${data.id}`,
      redirect_url: `${origin}/payment/${data.id}`, notification_url: `${origin}/api/payments/${data.id}/webhook?token=${webhookToken(data.id)}`,
      nomenclature: [...items.map((item) => ({ name: `${item.name} · ${item.date}`.slice(0, 100), count: item.quantity, price: item.price * 100, amount: item.price * item.quantity * 100 })),
        { name: 'Доставка', count: new Set(items.map((item) => item.date)).size, price: site.deliveryFee * 100, amount: delivery * 100 }],
    });
    Object.assign(record, result, { state: 'pending' });
  } catch (error) { record.state = error instanceof ProviderError ? error.outcome : 'unknown'; }
  // If persistence fails after provider creation, keep the reservation. Never repeat that POST.
  await save(record, reserved.etag);
  return publicPayment(record);
}
export async function refreshPayment(id: string, operationId?: string) {
  const current = await read(id);
  if (!current) throw new HttpError(404, 'Платёж не найден.');
  const record = current.value;
  if (operationId && record.state === 'creating') throw new HttpError(503, 'Операция ещё сохраняется.');
  if (operationId && record.operationId !== operationId) throw new HttpError(400, 'Операция не совпадает.');
  if (record.state !== 'pending' || !record.operationId || (!operationId && Date.now() - record.checkedAt < 5000)) return publicPayment(record);
  record.checkedAt = Date.now();
  try { await save(record, current.etag); }
  catch (error) { if (error instanceof ConflictError) return publicPayment((await read(id))!.value); throw error; }
  try {
    const status = await readQrStatus(record.operationId);
    if (status.operation_sum !== record.total * 100) throw new ProviderError('unknown');
    switch (status.operation_status_code) {
      case 5: record.state = 'paid'; break;
      case 6: record.state = 'cancelled'; break;
      case 8: record.state = 'expired'; break;
      case 0: case 3: case 4: break; // SSE timeout is not an expired payment.
      default: throw new ProviderError('unknown');
    }
    const latest = (await read(id))!;
    if (latest.value.state !== 'pending') return publicPayment(latest.value);
    await save(record, latest.etag);
  } catch (error) {
    if (error instanceof ConflictError) return publicPayment((await read(id))!.value);
    throw new HttpError(502, 'QR Manager пока не подтвердил статус. Не создавайте повторную оплату; попробуйте проверить ещё раз.');
  }
  return publicPayment(record);
}
export function paymentFailure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: 'Проверьте состав заказа и обновите оформление.' }, 400);
  console.error('Payment request failed:', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: 'Не удалось подтвердить результат. Повторите проверку этой попытки оплаты.' }, 503);
}
