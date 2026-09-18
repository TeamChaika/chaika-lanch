import { findMeal, isMealAvailable, menuWeekForDate } from '@/data/menu';
import { site } from '@/data/site';

export interface CartItem { mealId: string; date: string; quantity: number }
export interface DeliveryAddress { city: string; street: string; office: string; floor: string }
export interface DeliveryDay { value: string; short: string; number: string; full: string }
export interface DeliveryWeek { value: string; menuWeek: number; label: string; days: DeliveryDay[] }

export function deliveryWeeks(now = new Date()): DeliveryWeek[] {
  const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Simferopol' }).format(now);
  const first = new Date(`${localDay < site.menuCycleStartsOn ? site.menuCycleStartsOn : localDay}T12:00:00Z`);
  const weekday = first.getUTCDay();
  // Weekends start with next Monday; weekdays retain their calendar week.
  first.setUTCDate(first.getUTCDate() + (weekday === 0 ? 1 : weekday === 6 ? 2 : 1 - weekday));
  return Array.from({ length: 4 }, (_, weekIndex) => {
    const monday = new Date(first);
    monday.setUTCDate(monday.getUTCDate() + weekIndex * 7);
    const value = monday.toISOString().slice(0, 10);
    const days = Array.from({ length: 5 }, (_, dayIndex) => {
      const date = new Date(monday);
      date.setUTCDate(date.getUTCDate() + dayIndex);
      return { value: date.toISOString().slice(0, 10), short: new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' }).format(date), number: String(date.getUTCDate()), full: new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date) };
    });
    return { value, menuWeek: menuWeekForDate(value)!, label: `${formatDate(value)} — ${formatDate(days[4].value)}`, days: days.filter((day) => day.value >= localDay) };
  });
}

export const deliveryDays = (now = new Date()): DeliveryDay[] => deliveryWeeks(now).flatMap((week) => week.days);

export const formatDate = (value: string) => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
export const itemKey = (item: Pick<CartItem, 'mealId' | 'date'>) => `${item.date}:${item.mealId}`;
export const cartTotal = (items: CartItem[]) => items.reduce((sum, item) => sum + (findMeal(item.mealId)?.price ?? 0) * item.quantity, 0);

// Count delivery dates, not portions: five lunches on one day are not a weekly order.
export function weeklyGiftStatus(items: readonly Pick<CartItem, 'date' | 'quantity'>[]) {
  const days = new Set(items.filter((item) => item.quantity > 0).map((item) => item.date)).size;
  return { days, eligible: days >= site.weeklyGift.requiredDays };
}

export function addItem(items: CartItem[], mealId: string, date: string): CartItem[] {
  if (!isMealAvailable(mealId, date)) return items;
  const found = items.some((item) => item.mealId === mealId && item.date === date);
  if (!found) return [...items, { mealId, date, quantity: 1 }];
  return items.map((item) => item.mealId === mealId && item.date === date ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item);
}

export function readSavedCart(raw: string | null, allowedDays: string[]): CartItem[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const valid = parsed.filter((item): item is CartItem => typeof item === 'object' && item !== null && typeof item.mealId === 'string' && typeof item.date === 'string' && allowedDays.includes(item.date) && isMealAvailable(item.mealId, item.date) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99);
  const unique = new Map<string, CartItem>();
  valid.forEach((item) => unique.set(itemKey(item), { mealId: item.mealId, date: item.date, quantity: item.quantity }));
  return [...unique.values()];
}
