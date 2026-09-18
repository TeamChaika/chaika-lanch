import type { Metadata } from 'next';
import { Storefront } from '@/components/Storefront';
import { MenuProvider } from '@/components/MenuProvider';
import { readMenu } from '@/lib/server/menu-store';
import { paymentMode, paymentsEnabled } from '@/lib/server/payment-config';
const title = 'Чайка Обеды — доставка готовых обедов за 550 ₽';
const description = 'Готовые обеды за 550 ₽ в Ялте, Севастополе и Симферополе: горячее, суп, салат и компот. Каждый день новое меню. Закажите на неделю — выпечка в подарок.';
const socialImage = { url: '/social/chaika-lunch-v1.jpg', width: 1200, height: 630, alt: 'Чайка Обеды: полный обед за 550 ₽. Ялта, Севастополь, Симферополь. Пример подачи.' };
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  openGraph: {
    type: 'website', locale: 'ru_RU', siteName: 'Чайка Обеды', url: '/', title, description,
    images: [{ ...socialImage, type: 'image/jpeg' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: [socialImage] },
};
export const dynamic = 'force-dynamic';
export default async function Home() {
  const { catalog } = await readMenu();
  return <MenuProvider catalog={catalog}><Storefront paymentMode={paymentsEnabled() ? paymentMode() : 'disabled'} /></MenuProvider>;
}
