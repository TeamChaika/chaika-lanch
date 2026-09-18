import { z } from 'zod';

export const paymentInput = z.object({
  id: z.uuid(),
  items: z.array(z.object({ mealId: z.string().min(1).max(80), date: z.iso.date(), quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(40),
  expectedTotal: z.number().int().positive().max(100000000),
}).strict();
export type PaymentInput = z.infer<typeof paymentInput>;
export type PaymentState = 'creating' | 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'unknown';
export interface PaymentView {
  id: string; state: PaymentState; total: number; delivery: number; gift: boolean;
  items: { mealId: string; date: string; quantity: number; name: string; price: number }[];
  qrImage?: string; paymentUrl?: string; number?: string;
}
