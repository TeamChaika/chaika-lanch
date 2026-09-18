import { PaymentScreen } from '@/components/PaymentScreen';
export const dynamic = 'force-dynamic';
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  return <PaymentScreen id={(await params).id} />;
}
