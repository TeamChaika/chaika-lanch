import { z } from 'zod';
import { requireOwner } from '@/lib/server/auth';
import { json } from '@/lib/server/http';
import { ownerOrders, paymentFailure } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    await requireOwner(); const params = new URL(request.url).searchParams;
    const day = z.iso.date().parse(params.get('day'));
    const mode = z.enum(['live', 'sandbox']).parse(params.get('mode') || 'live');
    const cursor = z.string().max(3000).optional().parse(params.get('cursor') || undefined);
    return json(await ownerOrders(day, mode, cursor));
  } catch (error) { return paymentFailure(error); }
}
