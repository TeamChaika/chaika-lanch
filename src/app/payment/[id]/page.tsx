import type { Metadata } from 'next';
import { PaymentScreen } from '@/components/PaymentScreen';
export const metadata: Metadata = { title: 'Оплата заказа — Чайка Обеды', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  return <PaymentScreen id={(await params).id} />;
}
