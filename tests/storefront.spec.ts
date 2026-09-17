import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-21T09:00:00+03:00') });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'На неделю', exact: true })).toBeEnabled();
});

test('menu, item detail, persistent cart and honest demo checkout', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: /Что на обед|Обед готов/ })).toBeVisible();
  await page.getByRole('button', { name: 'Состав обеда Домашний' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Куриный суп с лапшой')).toBeVisible();
  await dialog.getByText('Состав и аллергены', { exact: true }).click();
  await expect(dialog.getByText(/Молоко, пшеница/)).toBeVisible();
  await dialog.getByRole('button', { name: /Добавить · 450/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Увеличить: Домашний', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Увеличить: Домашний', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 2' }).click();
  await expect(dialog.locator('.total-row')).toContainText('900');
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.getByText(/Заказ не отправится, оплаты нет/)).toBeVisible();
  await dialog.getByLabel('Улица и дом', { exact: true }).fill('ул. Примерная, 12');
  await dialog.getByLabel('Имя', { exact: true }).fill('Тест');
  await dialog.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await expect(dialog.locator('.total-row')).toContainText('1 000');
  await dialog.getByRole('button', { name: 'Посмотреть подтверждение' }).click();
  await expect(dialog.getByRole('heading', { name: 'Демо-заказ собран' })).toBeVisible();
  await expect(dialog.getByText(/оплата не списывалась/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Вернуться в меню' }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('week order preserves dates and calculates delivery once per day', async ({ page }) => {
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.week-select select').last().selectOption('');
  await expect(dialog.getByText('Дней с обедом: 4')).toBeVisible();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(0);
  await expect(dialog.locator('.gift-card')).toContainText('Выбрано дней: 4 из 5');
  await expect(dialog.locator('.total-row')).toContainText('1 900');
  await dialog.getByRole('button', { name: 'Добавить в корзину' }).click();
  await expect(dialog.locator('.cart-item')).toHaveCount(4);
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.locator('.total-row')).toContainText('2 300');
  await expect(dialog.locator('.gift-summary')).toHaveCount(0);
  await expect(dialog.getByText('Доставка, 4 дн.')).toBeVisible();
});

test('weekday menus and week picker show the same twelve distinct lunches', async ({ page }) => {
  const expected = [
    ['homestyle', 'classic', 'special'],
    ['turkey-bulgur', 'meatballs-pasta', 'pork-potatoes'],
    ['chicken-plov', 'hake-couscous'],
    ['chicken-cutlet', 'beef-stroganoff'],
    ['stuffed-peppers', 'chicken-mushroom'],
  ];
  const names: string[] = [];
  for (let day = 0; day < 5; day++) {
    await page.locator('.date-tab').nth(day).click();
    await expect(page.locator('.meal-card')).toHaveCount(expected[day].length);
    names.push(...await page.locator('.meal-title').allTextContents());
  }
  expect(new Set(names).size).toBe(12);
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  const selects = page.getByRole('dialog').locator('.week-select select');
  for (let day = 0; day < 5; day++) {
    const values = await selects.nth(day).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(values).toEqual([...expected[day], '']);
  }
});

test('full week earns one free pastry through reload and confirmation', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.gift-card--earned')).toContainText('0 ₽');
  await dialog.getByRole('button', { name: 'Добавить в корзину' }).click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(1);
  await expect(dialog.locator('.total-row')).toContainText('2 400');
  await page.reload();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 5' }).click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.locator('.gift-summary')).toContainText('Выпечка в подарок · 1 шт.');
  await expect(dialog.locator('.gift-summary')).toContainText('0 ₽');
  await expect(dialog.locator('.total-row')).toContainText('2 900');
  await dialog.getByLabel('Улица и дом', { exact: true }).fill('ул. Примерная, 12');
  await dialog.getByLabel('Имя', { exact: true }).fill('Тест');
  await dialog.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await dialog.getByRole('button', { name: 'Посмотреть подтверждение' }).click();
  await expect(dialog.getByRole('heading', { name: 'Демо-заказ собран' })).toBeVisible();
  await expect(dialog.locator('.gift-card--earned')).toContainText('0 ₽');
  await expect(dialog.locator('.total-row')).toContainText('2 900');
});

test('removing a delivery day withdraws the weekly gift', async ({ page }) => {
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Добавить в корзину' }).click();
  await dialog.getByRole('button', { name: /^Удалить / }).last().click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(0);
  await expect(dialog.locator('.gift-card')).toContainText('Выбрано дней: 4 из 5');
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.locator('.gift-summary')).toHaveCount(0);
  await expect(dialog.locator('.total-row')).toContainText('2 300');
});

test('five portions on one day do not earn the weekly gift', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Состав обеда Домашний' }).click();
  const dialog = page.getByRole('dialog');
  for (let index = 0; index < 4; index++) await dialog.getByRole('button', { name: 'Увеличить: Домашний', exact: true }).click();
  await dialog.getByRole('button', { name: /Добавить ·/ }).click();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 5' }).click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(0);
  await expect(dialog.locator('.gift-card')).toContainText('Выбрано дней: 1 из 5');
  await expect(dialog.locator('.total-row')).toContainText('2 250');
});

test('city selection, keyboard dialog dismissal and narrow layout', async ({ page }, testInfo) => {
  await page.getByLabel('Выберите город').selectOption('Симферополь');
  await page.getByRole('button', { name: 'Укажите адрес доставки' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Город', exact: true })).toHaveValue('Симферополь');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Укажите адрес доставки' })).toBeFocused();
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 780 });
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
});

test('invalid persisted cart cannot inject unknown products or totals', async ({ page }, testInfo) => {
  await page.evaluate(() => localStorage.setItem('chaika-lunch-cart-v1', JSON.stringify([{ mealId: 'unknown', date: '2099-01-01', quantity: -3 }])));
  await page.reload();
  await expect(page.getByRole('button', { name: 'На неделю', exact: true })).toBeEnabled();
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Корзина/ }).click();
  } else await page.getByRole('button', { name: 'Корзина, товаров: 0' }).click();
  await expect(page.getByRole('heading', { name: 'Здесь будет ваш обед' })).toBeVisible();
});
