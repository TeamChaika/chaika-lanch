import { checkOrigin, json } from '@/lib/server/http';
import { checkoutSession, paymentFailure } from '@/lib/server/payment-store';
import { sandboxEnabled } from '@/lib/server/qrmanager';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { checkOrigin(request); if (!sandboxEnabled()) return json({ enabled: false }); await checkoutSession(true); return json({ enabled: true }); }
  catch (error) { return paymentFailure(error); }
}
