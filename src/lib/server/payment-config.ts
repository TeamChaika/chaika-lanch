import 'server-only';
import type { PaymentMode } from '@/lib/payments';
import { HttpError } from './http';

export const sandboxHost = 'https://app.devwapiserv.qrm.ooo';
export function paymentMode(): PaymentMode | 'disabled' {
  return process.env.QRM_MODE === 'live' ? 'live' : process.env.QRM_MODE === 'sandbox' ? 'sandbox' : 'disabled';
}
export function providerConfig(mode: PaymentMode) {
  const fixture = process.env.NODE_ENV === 'development' ? process.env.QRM_TEST_ORIGIN : undefined;
  if (fixture && !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture)) throw new Error('Invalid QRM fixture');
  const key = mode === 'live' ? process.env.QRM_LIVE_API_KEY : process.env.QRM_API_KEY;
  const host = mode === 'live' ? process.env.QRM_API_BASE_URL : sandboxHost;
  if (!key || !host) throw new HttpError(503, 'Оплата ещё не настроена. Обратитесь к владельцу сервиса.');
  const url = new URL(host);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
    !(url.hostname.endsWith('.qrm.ooo') || url.hostname.endsWith('.qrmanager.ru')) ||
    (mode === 'live' && (url.origin === sandboxHost || /dev|test|sandbox/.test(url.hostname)))) throw new Error('Invalid QRM API origin');
  return { host: fixture || url.origin, key };
}
export function paymentsEnabled() {
  const mode = paymentMode();
  if (mode === 'disabled') return false;
  try { providerConfig(mode); return true; } catch { return false; }
}
