import type imageManifest from './image-manifest.json';
import monthlyMenu from './monthly-menu.json';
import { site } from './site';

export interface Dish { name: string; weight: number; category: string }
export interface Meal {
  id: string;
  name: string;
  description: string;
  price: number;
  image: keyof typeof imageManifest;
  tag: string;
  week: number;
  weekday: number;
  dishes: Dish[];
}

// Serving examples from the supplied photo folder; not exact recipe photos.
const servingPhotos: Meal['image'][] = ['/images/lunch-photo-029.webp', '/images/lunch-photo-007.webp', '/images/lunch-photo-003.webp', '/images/lunch-photo-019.webp', '/images/lunch-photo-016.webp'];

// Source: Комплексные_обеды_меню_на_месяц.xlsx, «Меню на месяц», A4:F23.
// Component weights total 850 g; the source's 950 g footer is inconsistent.
export const meals: Meal[] = monthlyMenu.map((entry) => ({
  id: `week-${entry.week}-day-${entry.weekday}`,
  name: entry.hot.split(',')[0],
  description: entry.hot,
  price: site.mealPrice,
  image: servingPhotos[(entry.weekday + entry.week - 2) % servingPhotos.length],
  tag: `Неделя ${entry.week} · ${entry.day}`,
  week: entry.week,
  weekday: entry.weekday,
  dishes: [
    { category: 'Салат', name: entry.salad, weight: 100 },
    { category: 'Суп', name: entry.soup, weight: 250 },
    { category: 'Горячее', name: entry.hot, weight: 300 },
    { category: 'Компот', name: entry.compote, weight: 200 },
  ],
}));

const DAY_MS = 86_400_000;
export function menuWeekForDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  const elapsedDays = Math.floor((timestamp - Date.parse(`${site.menuCycleStartsOn}T12:00:00Z`)) / DAY_MS);
  if (elapsedDays < 0) return null;
  return Math.floor(elapsedDays / 7) % 4 + 1;
}

export function mealsForDate(date: string): Meal[] {
  const week = menuWeekForDate(date);
  if (week === null) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return meals.filter((meal) => meal.week === week && meal.weekday === weekday);
}
export const isMealAvailable = (mealId: string, date: string) => mealsForDate(date).some((meal) => meal.id === mealId);
export const findMeal = (id: string) => meals.find((meal) => meal.id === id);
export const money = (amount: number) => `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;
