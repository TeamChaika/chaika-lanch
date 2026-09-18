import { expect, test } from '@playwright/test';
import { isMealAvailable, meals, mealsForDate, menuWeekForDate } from '../src/data/menu';
import { addItem, deliveryWeeks, readSavedCart } from '../src/lib/order';
import { site } from '../src/data/site';

test('source menu has twenty complete complexes at the agreed price', () => {
  expect(meals).toHaveLength(20);
  expect(new Set(meals.map((meal) => meal.id)).size).toBe(20);
  expect(new Date(`${site.menuCycleStartsOn}T12:00:00Z`).getUTCDay()).toBe(1);
  for (const meal of meals) {
    expect(meal.price).toBe(550);
    expect(meal.dishes.map((dish) => dish.weight)).toEqual([100, 250, 300, 200]);
    expect(meal.dishes.reduce((sum, dish) => sum + dish.weight, 0)).toBe(850);
  }
});

test('menu follows four-week cycle across months and rejects invalid or prelaunch dates', () => {
  for (const [date, id] of [
    ['2026-09-21', 'week-1-day-1'], ['2026-09-30', 'week-2-day-3'],
    ['2026-10-01', 'week-2-day-4'], ['2026-10-09', 'week-3-day-5'],
    ['2026-10-16', 'week-4-day-5'], ['2026-10-19', 'week-1-day-1'],
    ['2027-01-11', 'week-1-day-1'],
  ]) expect(mealsForDate(date).map((meal) => meal.id)).toEqual([id]);
  for (const date of ['', '2026-09-18', '2026-09-26', '2026-09-27', '2026-02-30', '2026-13-01', 'oops']) {
    expect(mealsForDate(date)).toEqual([]);
  }
  expect(menuWeekForDate('2026-02-30')).toBeNull();
  expect(isMealAvailable('week-1-day-1', '2026-09-28')).toBe(false);
});

test('calendar starts at launch, excludes past dates, advances on weekends and uses Crimea timezone', () => {
  const prelaunch = deliveryWeeks(new Date('2026-09-18T12:00:00+03:00'));
  expect(prelaunch.flatMap((week) => week.days)).toHaveLength(20);
  expect(prelaunch[0].value).toBe('2026-09-21');
  expect(prelaunch[3].days[4].value).toBe('2026-10-16');
  const midweek = deliveryWeeks(new Date('2026-09-23T12:00:00+03:00'));
  expect(midweek[0].days.map((day) => day.value)).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
  for (const date of ['2026-09-26T12:00:00+03:00', '2026-09-27T12:00:00+03:00']) {
    expect(deliveryWeeks(new Date(date))[0].value).toBe('2026-09-28');
  }
  // UTC Sunday evening is already Monday in Crimea.
  expect(deliveryWeeks(new Date('2026-10-18T22:00:00Z'))[0].menuWeek).toBe(1);
});

test('cart drops obsolete demo products, wrong weeks, past dates and duplicate entries', () => {
  const allowed = deliveryWeeks(new Date('2026-09-21T09:00:00+03:00')).flatMap((week) => week.days.map((day) => day.value));
  const valid = { mealId: 'week-4-day-1', date: '2026-10-12', quantity: 1 };
  const saved = [valid, valid, { mealId: 'homestyle', date: '2026-09-21', quantity: 1 },
    { mealId: 'week-1-day-1', date: '2026-09-28', quantity: 1 },
    { mealId: 'week-1-day-1', date: '2026-10-19', quantity: 1 }];
  expect(readSavedCart(JSON.stringify(saved), allowed)).toEqual([valid]);
  expect(addItem([], 'week-1-day-1', '2026-09-28')).toEqual([]);
});
