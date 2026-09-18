import 'server-only';
import { z } from 'zod';
import QRCode from 'qrcode';
import { HttpError, limitedBody } from './http';
import type { PaymentMode } from '@/lib/payments';
import { providerConfig } from './payment-config';

export class ProviderError extends Error {
  constructor(public outcome: 'failed' | 'unknown', public diagnostic?: string) { super('QR Manager request failed'); }
}
export function paymentLink(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !['qrm.ooo', 'qrmanager.ru', 'nspk.ru'].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new ProviderError('unknown');
  return url.href;
}
const createResult = z.object({ results: z.object({ operation_id: z.uuid(), number: z.union([z.string(), z.number()]), qr_link: z.string().max(4096), payment_page_link: z.string().max(4096).nullish() }) });
export async function createQr(input: { sum: number; payment_purpose: string; notification_url: string; redirect_url: string; customer_email?: string; nomenclature?: { name: string; count: number; price: number; amount: number; payment_method?: number }[] }, mode: PaymentMode = 'sandbox') {
  const { host, key } = providerConfig(mode);
  try {
    // No automatic retries: QRM does not document an idempotency key for this POST.
    const response = await fetch(`${host}/operations/qr-code/`, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key }, body: JSON.stringify(input) });
    if (!response.ok) {
      let detail = '';
      try {
        detail = Buffer.from(await limitedBody(response, 16000)).toString().replaceAll(key, '[ключ скрыт]').replace(/https?:\/\/[^\s"<>]+/g, '[ссылка скрыта]').replace(/[\x00-\x1f]+/g, ' ').slice(0, 500);
      } catch { /* HTTP status remains known even if its diagnostic body is unavailable. */ }
      // Only the encrypted owner record receives this detail, never the public API or logs.
      throw new ProviderError([400, 401, 403, 422].includes(response.status) ? 'failed' : 'unknown', `QR Manager HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = createResult.parse(JSON.parse(Buffer.from(await limitedBody(response, 64000)).toString())).results;
    const qrLink = paymentLink(data.qr_link);
    return { operationId: data.operation_id, number: String(data.number), paymentUrl: paymentLink(data.payment_page_link || qrLink),
      qrImage: await QRCode.toDataURL(qrLink, { width: 320, margin: 4 }) };
  } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError('unknown'); }
}

const statusResult = z.object({ results: z.object({ operation_status_code: z.number().int(), operation_sum: z.number().int().nonnegative() }) });
export function parseStatus(value: unknown) { return statusResult.parse(value).results; }
export async function readQrStatus(operationId: string, mode: PaymentMode = 'sandbox') {
  z.uuid().parse(operationId);
  const { host, key } = providerConfig(mode);
  const response = await fetch(`${host}/api/v2/sse-operations/${operationId}/qr-status/`, { headers: { Accept: 'text/event-stream, application/json', 'X-Api-Key': key }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ProviderError('unknown');
  if (response.headers.get('content-type')?.includes('application/json')) return parseStatus(JSON.parse(Buffer.from(await limitedBody(response, 32000)).toString()));
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('unknown');
  const decoder = new TextDecoder(); let buffer = ''; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new ProviderError('unknown');
      size += value.length;
      if (size > 64000) throw new ProviderError('unknown');
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (data) return parseStatus(JSON.parse(data));
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function checkMerchant(mode: PaymentMode) {
  const { host, key } = providerConfig(mode);
  const response = await fetch(`${host}/users/check-api-key/`, { headers: { 'X-Api-Key': key }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new HttpError(503, 'Не удалось проверить платёжный терминал. Оплата временно недоступна.');
  const merchant = z.object({ merchant_id: z.string().min(1), firm_name: z.string().min(1), qrt_name: z.string(), qrt_is_b2c: z.boolean(), vat: z.string().optional(), requires_receipt: z.boolean(), is_nomenclature: z.boolean().optional() }).parse(JSON.parse(Buffer.from(await limitedBody(response, 16000)).toString()));
  if (!merchant.qrt_is_b2c || (mode === 'live' && /тестовая компания/i.test(merchant.firm_name))) throw new HttpError(503, 'Терминал не готов к приёму оплаты покупателей.');
  return merchant;
}
