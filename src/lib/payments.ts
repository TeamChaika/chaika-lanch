import { z } from 'zod';
import { site } from '@/data/site';

export const customerInput = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().regex(/^7\d{10}$/),
  email: z.email().max(150),
  address: z.object({ city: z.enum(site.cities), street: z.string().trim().min(5).max(150), office: z.string().trim().max(20), floor: z.string().trim().max(5) }).strict(),
  slot: z.enum(site.deliverySlots),
}).strict();
export type Customer = z.infer<typeof customerInput>;
export type PaymentMode = 'sandbox' | 'live';

export const paymentInput = z.object({
  id: z.uuid(),
  items: z.array(z.object({ mealId: z.string().min(1).max(80), date: z.iso.date(), quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(40),
  expectedTotal: z.number().int().positive().max(100000000),
  customer: customerInput.optional(),
}).strict();
export type PaymentInput = z.infer<typeof paymentInput>;
export type PaymentState = 'creating' | 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'unknown';
export interface PaymentView {
  id: string; state: PaymentState; total: number; delivery: number; gift: boolean;
  mode: PaymentMode; createdAt: number; paidAt?: number; verifiedAt?: number;
  fulfillment?: 'new' | 'accepted' | 'completed';
  items: { mealId: string; date: string; quantity: number; name: string; price: number }[];
  qrImage?: string; paymentUrl?: string; number?: string;
}
export interface OwnerOrder extends PaymentView { customer?: Customer; operationId?: string; reviewReason?: string }
