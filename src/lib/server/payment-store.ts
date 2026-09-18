import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import { findMeal, isMealAvailable } from '@/data/menu';
import { site } from '@/data/site';
import { deliveryDays, itemKey, weeklyGiftStatus } from '@/lib/order';
import { customerInput, paymentInput, type Customer, type OwnerOrder, type PaymentMode, type PaymentView } from '@/lib/payments';
import { readMenu } from './menu-store';
import { ConflictError, readObject, writeObject, listObjects, deleteQueueObject } from './storage';
import { HttpError, json } from './http';
import { checkMerchant, createQr, ProviderError, readQrStatus } from './qrmanager';
import { paymentMode, paymentsEnabled } from './payment-config';

const cookieName = 'chaika_checkout';
const lifetime = 7 * 86400;
interface PaymentRecord extends PaymentView {
  purpose: 'sandbox-payment' | 'live-payment'; owner: string; fingerprint: string; checkedAt: number;
  operationId?: string; candidateOperationId?: string; customer?: Customer; reviewReason?: string; verifiedVia?: string;
}
function password(mode: PaymentMode = 'sandbox') { const value = process.env.SESSION_SECRET; if (!value || value.length < 32) throw new Error('Missing secret'); return `${value}:qrm-${mode}`; }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const key = (id: string, mode: PaymentMode) => `cms/payments/${mode}/${z.uuid().parse(id)}.sealed`;
const queueKey = (id: string, mode: PaymentMode) => `cms/payments/pending/${mode}/${id}.json`;
async function read(id: string, mode: PaymentMode) {
  const object = await readObject(key(id, mode));
  if (!object) return null;
  const value = await unsealData<PaymentRecord>(object.body, { password: password(mode), ttl: 0 });
  if (value.purpose !== `${mode}-payment` || value.id !== id) throw new Error('Invalid payment record');
  value.mode = mode; // Existing sandbox records predate this field.
  return { value, etag: object.etag };
}
async function find(id: string) {
  const preferred = paymentMode() === 'live' ? 'live' : 'sandbox';
  return await read(id, preferred) || await read(id, preferred === 'live' ? 'sandbox' : 'live');
}
async function save(value: PaymentRecord, etag: string | null) {
  const body = await sealData(value, { password: password(value.mode), ttl: 0 });
  await writeObject(key(value.id, value.mode), body, { expected: etag, type: 'application/octet-stream' });
}
async function mutate(id: string, mode: PaymentMode, update: (record: PaymentRecord) => PaymentRecord) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await read(id, mode);
    if (!current) throw new HttpError(404, 'Платёж не найден.');
    const next = update(current.value);
    try { await save(next, current.etag); return next; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
  }
  throw new ConflictError();
}
class ActivePaymentError extends HttpError {
  constructor(public paymentId: string) { super(409, 'У вас уже есть незавершённая оплата. Сначала проверьте её результат.'); }
}
async function reserveActive(owner: string, mode: PaymentMode, id: string, fingerprint: string) {
  if (mode !== 'live') return null;
  const name = `cms/payments/active/${mode}/${owner}.sealed`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = await readObject(name);
    if (previous) {
      const active = await unsealData<{ purpose: string; id: string; fingerprint: string }>(previous.body, { password: password(mode), ttl: 0 });
      if (active.purpose !== 'active-payment') throw new Error('Invalid active payment');
      if (active.id === id) return null;
      const stored = await read(active.id, mode);
      if (!stored || ['creating', 'pending', 'unknown'].includes(stored.value.state)) {
        if (stored && active.fingerprint === fingerprint) return publicPayment(stored.value);
        throw new ActivePaymentError(active.id);
      }
    }
    try { await writeObject(name, await sealData({ purpose: 'active-payment', id, fingerprint }, { password: password(mode), ttl: 0 }), { expected: previous?.etag ?? null, type: 'application/octet-stream' }); return null; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
  }
  throw new ConflictError();
}
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
async function paymentRateLimit(owner: string) {
  for (const [name, limit, windowMs] of [['global', 60, 60000], [owner, 8, 600000]] as const) {
    const storageKey = `cms/payments/limits/${name}.json`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await readObject(storageKey);
      const previous = current ? JSON.parse(current.body) as { start: number; count: number } : { start: 0, count: 0 };
      const next = Date.now() - previous.start >= windowMs ? { start: Date.now(), count: 1 } : { ...previous, count: previous.count + 1 };
      if (next.count > limit) throw new HttpError(429, 'Слишком много попыток оплаты. Попробуйте позже.');
      try { await writeObject(storageKey, JSON.stringify(next), { expected: current?.etag ?? null }); break; }
      catch (error) { if (!(error instanceof ConflictError) || attempt === 4) throw error; }
    }
  }
}
export function webhookToken(id: string, mode: PaymentMode = 'sandbox') { return createHmac('sha256', password(mode)).update(`qrm-webhook:${id}`).digest('hex'); }
export function verifyWebhook(id: string, token: string, mode: PaymentMode = 'sandbox') { return /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(webhookToken(id, mode), 'hex')); }
export async function ownedPayment(id: string) {
  const owner = await checkoutSession(); const current = await find(id);
  if (!current || current.value.owner !== owner) throw new HttpError(404, 'Платёж не найден в этом браузере.');
  return current.value;
}
export function publicPayment(record: PaymentRecord): PaymentView {
  return { id: record.id, mode: record.mode, createdAt: record.createdAt, paidAt: record.paidAt, verifiedAt: record.verifiedAt, fulfillment: record.fulfillment,
    state: record.state === 'creating' && Date.now() - record.createdAt > 120000 ? 'unknown' : record.state,
    items: record.items, total: record.total, delivery: record.delivery, gift: record.gift,
    qrImage: record.qrImage, paymentUrl: record.paymentUrl, number: record.number };
}
export async function createPayment(input: unknown, origin: string) {
  const mode = paymentMode();
  if (mode === 'disabled' || !paymentsEnabled()) throw new HttpError(503, 'Оплата ещё не настроена.');
  const data = paymentInput.parse(input); const owner = await checkoutSession();
  const customer = mode === 'live' ? customerInput.parse(data.customer) : undefined;
  data.items.sort((a, b) => itemKey(a).localeCompare(itemKey(b)));
  const fingerprint = digest(JSON.stringify({ items: data.items, expectedTotal: data.expectedTotal, ...(customer ? { customer } : {}) }));
  const existing = await find(data.id);
  if (existing) {
    if (existing.value.mode !== mode || existing.value.owner !== owner || existing.value.fingerprint !== fingerprint) throw new HttpError(409, 'Эта попытка оплаты уже использована. Обновите оформление.');
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
  const merchant = mode === 'live' ? await checkMerchant(mode) : undefined;
  const active = await reserveActive(owner, mode, data.id, fingerprint);
  if (active) return active;
  const record: PaymentRecord = { id: data.id, purpose: `${mode}-payment`, mode, owner, fingerprint, createdAt: Date.now(), checkedAt: 0, state: 'creating', items, delivery, total, gift: weeklyGiftStatus(items).eligible, customer, fulfillment: 'new' };
  try { await save(record, null); }
  catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const winner = await ownedPayment(data.id);
    if (winner.fingerprint !== fingerprint) throw new HttpError(409, 'Эта попытка оплаты уже использована.');
    return publicPayment(winner);
  }
  // Persist the order, owner index and recovery queue before contacting the payment provider.
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Simferopol' }).format(new Date(record.createdAt));
  const newestFirst = String(9999999999999 - record.createdAt).padStart(13, '0');
  await writeObject(`cms/payments/index/${mode}/${day}/${newestFirst}-${record.id}.json`, JSON.stringify({ id: record.id }), { expected: null });
  await writeObject(queueKey(record.id, mode), JSON.stringify({ id: record.id }), { expected: null });
  let result: Awaited<ReturnType<typeof createQr>>;
  try {
    // QRM's live validator rejects the decorative middle dot used in the interface.
    result = await createQr({ sum: total * 100, payment_purpose: `Chaika Obedy ${mode === 'sandbox' ? 'TEST ' : ''}${data.id.replaceAll('-', '')}`,
      redirect_url: `${origin}/payment/${data.id}`, notification_url: `${origin}/api/payments/${data.id}/webhook?mode=${mode}&token=${webhookToken(data.id, mode)}`,
      ...(customer && merchant?.requires_receipt ? { customer_email: customer.email } : {}),
      ...(mode === 'sandbox' || merchant?.requires_receipt || merchant?.is_nomenclature ? { nomenclature: [...items.map((item) => ({ name: `${item.name} · ${item.date}`.slice(0, 100), count: item.quantity, price: item.price * 100, amount: item.price * item.quantity * 100, ...(mode === 'live' ? { payment_method: 1 } : {}) })),
        { name: 'Доставка', count: new Set(items.map((item) => item.date)).size, price: site.deliveryFee * 100, amount: delivery * 100, ...(mode === 'live' ? { payment_method: 1 } : {}) }] } : {}),
    }, mode);
  } catch (error) {
    const failed = await mutate(record.id, mode, (current) => current.operationId ? current : ({ ...current, state: error instanceof ProviderError ? error.outcome : 'unknown', reviewReason: error instanceof ProviderError && error.diagnostic ? error.diagnostic : 'Ответ создания платежа не подтверждён' }));
    return publicPayment(failed);
  }
  const saved = await mutate(record.id, mode, (current) => {
    // A fast webhook may have bound and verified the UUID before this POST returned.
    const known = current.operationId || current.candidateOperationId;
    if (known && known !== result.operationId) throw new HttpError(502, 'Идентификаторы операции не совпадают. Требуется проверка владельцем.');
    return { ...current, ...result, state: current.state === 'paid' || current.state === 'cancelled' || current.state === 'expired' ? current.state : 'pending' };
  });
  return publicPayment(saved);
}

export async function refreshPayment(id: string, options: { mode?: PaymentMode; operationId?: string; source?: 'webhook' | 'get' | 'worker' | 'owner'; force?: boolean } = {}) {
  let current = options.mode ? await read(id, options.mode) : await find(id);
  if (!current) throw new HttpError(404, 'Платёж не найден.');
  let record = current.value; const mode = record.mode;
  const known = record.operationId || record.candidateOperationId;
  if (options.operationId && known && known !== options.operationId) throw new HttpError(400, 'Операция не совпадает.');
  if (record.state === 'paid') return publicPayment(record);
  if (options.operationId && !known) {
    // Retain the callback hint even if the following GET fails; it is not proof of payment.
    await mutate(id, mode, (value) => {
      const existing = value.operationId || value.candidateOperationId;
      if (existing && existing !== options.operationId) throw new HttpError(400, 'Операция не совпадает.');
      return { ...value, candidateOperationId: options.operationId };
    });
    await writeObject(queueKey(id, mode), JSON.stringify({ id }));
    current = (await read(id, mode))!; record = current.value;
  }
  const operationId = record.operationId || record.candidateOperationId;
  if (!operationId) return publicPayment(record);
  // A signed callback can recover the UUID after a lost creation response. It is still verified by GET.
  if (!options.force && Date.now() - record.checkedAt < 5000) return publicPayment(record);
  try { await save({ ...record, checkedAt: Date.now() }, current.etag); }
  catch (error) { if (error instanceof ConflictError) return publicPayment((await read(id, mode))!.value); throw error; }
  let status: Awaited<ReturnType<typeof readQrStatus>>;
  try { status = await readQrStatus(operationId, mode); }
  catch { throw new HttpError(502, 'Платёж ещё не подтверждён. Продолжаем проверять; повторная оплата не требуется.'); }
  if (status.operation_sum !== record.total * 100) {
    await mutate(id, mode, (value) => ({ ...value, reviewReason: 'Сумма в QR Manager не совпадает с заказом' }));
    throw new HttpError(502, 'Сумма операции требует проверки владельцем. Оплата не подтверждена.');
  }
  if (![0, 3, 4, 5, 6, 8].includes(status.operation_status_code)) throw new HttpError(502, 'Неизвестный статус оплаты. Продолжаем проверку.');
  const saved = await mutate(id, mode, (value) => {
    if (value.state === 'paid') return value;
    if (value.operationId && value.operationId !== operationId) throw new HttpError(409, 'Операция уже изменилась.');
    const terminal = status.operation_status_code === 5 ? 'paid' : status.operation_status_code === 6 ? 'cancelled' : status.operation_status_code === 8 ? 'expired' : null;
    // Late pending events never overwrite cancellation; verified payment may arrive after it.
    const state = terminal || (['cancelled', 'expired'].includes(value.state) ? value.state : 'pending');
    return { ...value, operationId, candidateOperationId: undefined, state, checkedAt: Date.now(), verifiedAt: Date.now(), verifiedVia: options.source || 'get',
      ...(state === 'paid' ? { paidAt: value.paidAt || Date.now(), reviewReason: undefined } : {}) };
  });
  return publicPayment(saved);
}

export async function ownerOrders(day: string, mode: PaymentMode, cursor?: string) {
  z.iso.date().parse(day);
  const index = await listObjects(`cms/payments/index/${mode}/${day}/`, 30, cursor);
  const orders: OwnerOrder[] = [];
  for (let start = 0; start < index.names.length; start += 5) {
    await Promise.all(index.names.slice(start, start + 5).map(async (name) => {
      const id = name.match(/([a-f0-9-]{36})\.json$/)?.[1]; if (!id) return;
      const stored = await read(id, mode);
      if (stored) orders.push({ ...publicPayment(stored.value), customer: stored.value.customer, operationId: stored.value.operationId, reviewReason: stored.value.reviewReason });
    }));
  }
  return { orders: orders.sort((a, b) => b.createdAt - a.createdAt), cursor: index.cursor };
}
export async function setFulfillment(id: string, mode: PaymentMode, status: 'accepted' | 'completed') {
  return mutate(id, mode, (record) => {
    if (record.state !== 'paid') throw new HttpError(409, 'В работу можно принять только подтверждённый оплаченный заказ.');
    if (status === 'completed' && record.fulfillment !== 'accepted' && record.fulfillment !== 'completed') throw new HttpError(409, 'Сначала примите заказ в работу.');
    if (record.fulfillment === 'completed') return record;
    return { ...record, fulfillment: status };
  });
}
export async function reconcilePayments(mode: PaymentMode, cursor?: string) {
  const queue = await listObjects(`cms/payments/pending/${mode}/`, 8, cursor);
  let checked = 0; let errors = 0;
  // Bound parallelism: each provider request may hold an SSE connection for ten seconds.
  for (let start = 0; start < queue.names.length; start += 2) {
    await Promise.all(queue.names.slice(start, start + 2).map(async (name) => {
      const id = name.match(/([a-f0-9-]{36})\.json$/)?.[1]; if (!id) return;
      try {
        let stored = await read(id, mode); if (!stored) return;
        if (stored.value.state === 'creating' && Date.now() - stored.value.createdAt > 120000) await mutate(id, mode, (value) => value.state === 'creating' ? { ...value, state: 'unknown', reviewReason: 'Прервано создание операции; требуется сверка' } : value);
        await refreshPayment(id, { mode, source: 'worker' }); checked++;
        stored = await read(id, mode);
        if (stored && (stored.value.state === 'paid' || ['failed', 'unknown'].includes(stored.value.state) && !stored.value.operationId && !stored.value.candidateOperationId || ['cancelled', 'expired'].includes(stored.value.state) && Date.now() - stored.value.createdAt > 86400000)) await deleteQueueObject(name);
      } catch { errors++; }
    }));
  }
  return { checked, errors, cursor: queue.cursor };
}
export function paymentFailure(error: unknown) {
  if (error instanceof ActivePaymentError) return json({ error: error.message, paymentId: error.paymentId }, error.status);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: 'Проверьте состав заказа и контактные данные.' }, 400);
  console.error('Payment request failed:', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: 'Не удалось подтвердить результат. Повторите проверку этой попытки оплаты.' }, 503);
}
