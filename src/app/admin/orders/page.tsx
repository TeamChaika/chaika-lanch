import type { Metadata } from 'next';
import { Orders } from '@/components/admin/Orders';
import '../admin.css';
export const metadata: Metadata = { title: 'Заказы — Чайка Обеды', robots: { index: false, follow: false } };
export default function OrdersPage() { return <Orders />; }
