'use client';

import { useEffect, useState } from 'react';
import { useCatalog } from './MenuProvider';
import { addItem, CartItem, deliveryWeeks, DeliveryWeek, itemKey, readSavedCart } from '@/lib/order';

const STORAGE_KEY = 'chaika-lunch-cart-v1';

export function useCart() {
  const { catalog } = useCatalog();
  const [items, setItems] = useState<CartItem[]>([]);
  const [weeks, setWeeks] = useState<DeliveryWeek[]>([]);
  const days = weeks.flatMap((week) => week.days);
  const [date, setDate] = useState('');
  const activeWeek = weeks.find((week) => week.days.some((day) => day.value === date));
  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');

  useEffect(() => {
    // Resolve the local delivery date after hydration.
    const timer = window.setTimeout(() => {
      const nextWeeks = deliveryWeeks(new Date(), catalog);
      const schedule = nextWeeks.flatMap((week) => week.days);
      setWeeks(nextWeeks);
      setDate(schedule[0].value);
      try {
        setItems(readSavedCart(localStorage.getItem(STORAGE_KEY), schedule.map((day) => day.value), catalog));
      } catch {
        setStorageNotice('Корзина работает в этой вкладке. Сохранение в браузере недоступно.');
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [catalog]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Checkout still works if the browser denies storage or runs out of space.
      const timer = window.setTimeout(() => setStorageNotice('Корзина работает в этой вкладке. Сохранение в браузере недоступно.'), 0);
      return () => window.clearTimeout(timer);
    }
  }, [items, ready]);

  function add(mealId: string, targetDate = date, quantity = 1) {
    if (!days.some((day) => day.value === targetDate)) return;
    setItems((current) => Array.from({ length: quantity }).reduce<CartItem[]>((cart) => addItem(cart, mealId, targetDate, catalog), current));
  }

  function change(item: Pick<CartItem, 'mealId' | 'date'>, delta: number) {
    setItems((current) => current.map((entry) => itemKey(entry) === itemKey(item) ? { ...entry, quantity: Math.min(99, entry.quantity + delta) } : entry).filter((entry) => entry.quantity > 0));
  }

  function remove(item: Pick<CartItem, 'mealId' | 'date'>) {
    setItems((current) => current.filter((entry) => itemKey(entry) !== itemKey(item)));
  }

  function addWeek(selection: { date: string; mealId: string }[]) {
    setItems((current) => selection.filter((choice) => days.some((day) => day.value === choice.date)).reduce((cart, choice) => addItem(cart, choice.mealId, choice.date, catalog), current));
  }

  return { items, days, weeks, activeWeek, date, setDate, ready, storageNotice, add, change, remove, addWeek, clear: () => setItems([]) };
}
