import { checkOrigin, json } from '@/lib/server/http';
import { ownedPayment, paymentFailure, publicPayment, refreshPayment } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const record = await ownedPayment((await context.params).id);
    return json(new URL(request.url).searchParams.get('refresh') === '1' ? await refreshPayment(record.id, { mode: record.mode, source: 'get' }) : publicPayment(record));
  }
  catch (error) { return paymentFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { checkOrigin(request); const { id } = await context.params; await ownedPayment(id); return json(await refreshPayment(id)); }
  catch (error) { return paymentFailure(error); }
}
