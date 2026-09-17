'use client';

import { useEffect, useState } from 'react';
import { addItem, CartItem, deliveryDays, DeliveryDay, itemKey, readSavedCart } from '@/lib/order';

const STORAGE_KEY = 'chaika-lunch-cart-v1';

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [days, setDays] = useState<DeliveryDay[]>([]);
  const [date, setDate] = useState('');
  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');

  useEffect(() => {
    // Browser-only hydration keeps the static preview deterministic.
    const timer = window.setTimeout(() => {
      const schedule = deliveryDays();
      setDays(schedule);
      setDate(schedule[0].value);
      try {
        setItems(readSavedCart(localStorage.getItem(STORAGE_KEY), schedule.map((day) => day.value)));
      } catch {
        setStorageNotice('Корзина работает в этой вкладке. Сохранение в браузере недоступно.');
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    setItems((current) => Array.from({ length: quantity }).reduce<CartItem[]>((cart) => addItem(cart, mealId, targetDate), current));
  }

  function change(item: Pick<CartItem, 'mealId' | 'date'>, delta: number) {
    setItems((current) => current.map((entry) => itemKey(entry) === itemKey(item) ? { ...entry, quantity: Math.min(99, entry.quantity + delta) } : entry).filter((entry) => entry.quantity > 0));
  }

  function remove(item: Pick<CartItem, 'mealId' | 'date'>) {
    setItems((current) => current.filter((entry) => itemKey(entry) !== itemKey(item)));
  }

  function addWeek(selection: { date: string; mealId: string }[]) {
    setItems((current) => selection.filter((choice) => days.some((day) => day.value === choice.date)).reduce((cart, choice) => addItem(cart, choice.mealId, choice.date), current));
  }

  return { items, days, date, setDate, ready, storageNotice, add, change, remove, addWeek, clear: () => setItems([]) };
}
