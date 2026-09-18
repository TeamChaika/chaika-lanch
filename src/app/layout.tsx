import type { Metadata } from 'next';
import '@fontsource-variable/golos-text';
import './globals.css';

export const metadata: Metadata = {
  title: 'Чайка Обеды — обед готов, день свободен',
  description: 'Готовые обеды за 550 рублей. Ялта, Севастополь и Симферополь. Меню на четыре недели, питание для команды.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
