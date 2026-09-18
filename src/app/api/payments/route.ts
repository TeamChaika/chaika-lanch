import { checkOrigin, json, readJson } from '@/lib/server/http';
import { createPayment, paymentFailure } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { checkOrigin(request); return json(await createPayment(await readJson(request, 16000), request.headers.get('origin')!)); }
  catch (error) { return paymentFailure(error); }
}
