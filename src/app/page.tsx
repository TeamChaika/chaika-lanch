import { Storefront } from '@/components/Storefront';
import { MenuProvider } from '@/components/MenuProvider';
import { readMenu } from '@/lib/server/menu-store';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const { catalog } = await readMenu();
  return <MenuProvider catalog={catalog}><Storefront /></MenuProvider>;
}
