import { checkOrigin, json } from '@/lib/server/http';
import { checkoutSession, paymentFailure } from '@/lib/server/payment-store';
import { paymentMode, paymentsEnabled } from '@/lib/server/payment-config';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { checkOrigin(request); if (!paymentsEnabled()) return json({ enabled: false }); await checkoutSession(true); return json({ enabled: true, mode: paymentMode() }); }
  catch (error) { return paymentFailure(error); }
}
