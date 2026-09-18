import { z } from 'zod';
import { json, readJson, HttpError } from '@/lib/server/http';
import { paymentFailure, refreshPayment, verifyWebhook } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; z.uuid().parse(id);
    const params = new URL(request.url).searchParams;
    const mode = z.enum(['live', 'sandbox']).parse(params.get('mode') || 'sandbox');
    if (!verifyWebhook(id, params.get('token') || '', mode)) throw new HttpError(403, 'Запрос отклонён.');
    const input = z.object({ id: z.uuid() }).parse(await readJson(request, 8000));
    // The callback is only a signal to query QRM. Never trust its claimed status or amount.
    await refreshPayment(id, { mode, operationId: input.id, source: 'webhook', force: true });
    return json({ received: true });
  } catch (error) { return paymentFailure(error); }
}
