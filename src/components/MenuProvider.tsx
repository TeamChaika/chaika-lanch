'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { defaultCatalog, type MenuCatalog, findMeal, mealsForDate } from '@/data/menu';
import { cartTotal } from '@/lib/order';
const Context = createContext<MenuCatalog>(defaultCatalog);
export function MenuProvider({ catalog, children }: { catalog: MenuCatalog; children: ReactNode }) { return <Context.Provider value={catalog}>{children}</Context.Provider>; }
export function useCatalog() {
  const catalog = useContext(Context);
  const visible = catalog.meals.filter((meal) => meal.enabled !== false && !catalog.closedDays.includes(`${meal.week}-${meal.weekday}`));
  return { catalog, findMeal: (id: string) => findMeal(id, catalog), mealsForDate: (date: string) => mealsForDate(date, catalog), cartTotal: (items: Parameters<typeof cartTotal>[0]) => cartTotal(items, catalog), startingPrice: visible.length ? Math.min(...visible.map((meal) => meal.price)) : 550 };
}
