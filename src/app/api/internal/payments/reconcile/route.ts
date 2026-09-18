import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError, json, readJson } from '@/lib/server/http';
import { paymentFailure, reconcilePayments } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const expected = process.env.PAYMENT_WORKER_TOKEN || '';
    const actual = request.headers.get('x-payment-worker') || '';
    if (expected.length < 32 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new HttpError(403, 'Запрос отклонён.');
    const { mode, cursor } = z.object({ mode: z.enum(['live', 'sandbox']), cursor: z.string().max(3000).optional() }).strict().parse(await readJson(request, 5000));
    return json(await reconcilePayments(mode, cursor));
  } catch (error) { return paymentFailure(error); }
}
