import { z } from 'zod';
import { requireOwner } from '@/lib/server/auth';
import { checkOrigin, json, readJson } from '@/lib/server/http';
import { paymentFailure, publicPayment, refreshPayment, setFulfillment } from '@/lib/server/payment-store';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); await requireOwner();
    const { mode, action } = z.object({ mode: z.enum(['live', 'sandbox']), action: z.enum(['refresh', 'accepted', 'completed']) }).strict().parse(await readJson(request, 2000));
    const { id } = await context.params;
    return json(action === 'refresh' ? await refreshPayment(id, { mode, source: 'owner' }) : publicPayment(await setFulfillment(id, mode, action)));
  } catch (error) { return paymentFailure(error); }
}
