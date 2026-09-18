import { checkOrigin, json } from '@/lib/server/http';
import { ownedPayment, paymentFailure, publicPayment, refreshPayment } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return json(publicPayment(await ownedPayment((await context.params).id))); }
  catch (error) { return paymentFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { checkOrigin(request); const { id } = await context.params; await ownedPayment(id); return json(await refreshPayment(id)); }
  catch (error) { return paymentFailure(error); }
}
