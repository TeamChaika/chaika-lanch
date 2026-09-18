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
  await page.getByRole('button', { name: 'Состав обеда Куриная котлета' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Суп-лапша с курицей')).toBeVisible();
  await expect(dialog.locator('.dish-list li')).toHaveCount(4);
  await expect(dialog.locator('.dish-list')).toContainText('Яблоко — смородина');
  await expect(dialog.getByText('Полный обед · 850 г')).toBeVisible();
  await dialog.getByRole('button', { name: /Добавить · 550/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Увеличить: Куриная котлета', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Увеличить: Куриная котлета', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 2' }).click();
  await expect(dialog.locator('.total-row')).toContainText('1 100');
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.getByText(/Заказ не отправится, оплаты нет/)).toBeVisible();
  await dialog.getByLabel('Улица и дом', { exact: true }).fill('ул. Примерная, 12');
  await dialog.getByLabel('Имя', { exact: true }).fill('Тест');
  await dialog.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await expect(dialog.locator('.total-row')).toContainText('1 200');
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
  await expect(dialog.locator('.total-row')).toContainText('2 200');
  await dialog.getByRole('button', { name: 'Добавить в корзину' }).click();
  await expect(dialog.locator('.cart-item')).toHaveCount(4);
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.locator('.total-row')).toContainText('2 600');
  await expect(dialog.locator('.gift-summary')).toHaveCount(0);
  await expect(dialog.getByText('Доставка, 4 дн.')).toBeVisible();
});

test('all twenty complexes match the daily and weekly selectors', async ({ page }) => {
  const seen = new Set<string>();
  for (let week = 0; week < 4; week++) {
    await page.locator('.menu-week').nth(week).click();
    for (let day = 0; day < 5; day++) {
      await page.locator('.date-tab').nth(day).click();
      await expect(page.locator('.meal-card')).toHaveCount(1);
      await expect(page.locator('.meal-composition li')).toHaveCount(4);
      await expect(page.locator('.meal-card-bottom')).toContainText('550');
      seen.add(await page.locator('.meal-composition').innerText());
    }
    await page.getByRole('button', { name: 'На неделю', exact: true }).click();
    const selects = page.getByRole('dialog').locator('.week-select select');
    await expect(selects).toHaveCount(5);
    for (let day = 0; day < 5; day++) {
      const values = await selects.nth(day).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      expect(values).toEqual([`week-${week + 1}-day-${day + 1}`, '']);
    }
    await page.keyboard.press('Escape');
  }
  expect(seen.size).toBe(20);
});

test('ordering a later week retains its October dates across reload', async ({ page }) => {
  await page.locator('.menu-week').nth(3).click();
  await expect(page.locator('.menu-week').nth(3)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить в корзину' }).click();
  await expect(page.locator('.cart-date').first()).toHaveText('12 октября');
  await expect(page.locator('.cart-date').last()).toHaveText('16 октября');
  await page.reload();
  await expect(page.locator('.meal-card')).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chaika-lunch-cart-v1') ?? '[]'));
  expect(saved.map((item: {date: string}) => item.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
});

test('full week earns one free pastry through reload and confirmation', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.gift-card--earned')).toContainText('0 ₽');
  await dialog.getByRole('button', { name: 'Добавить в корзину' }).click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(1);
  await expect(dialog.locator('.total-row')).toContainText('2 750');
  await page.reload();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 5' }).click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.locator('.gift-summary')).toContainText('Выпечка в подарок · 1 шт.');
  await expect(dialog.locator('.gift-summary')).toContainText('0 ₽');
  await expect(dialog.locator('.total-row')).toContainText('3 250');
  await dialog.getByLabel('Улица и дом', { exact: true }).fill('ул. Примерная, 12');
  await dialog.getByLabel('Имя', { exact: true }).fill('Тест');
  await dialog.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await dialog.getByRole('button', { name: 'Посмотреть подтверждение' }).click();
  await expect(dialog.getByRole('heading', { name: 'Демо-заказ собран' })).toBeVisible();
  await expect(dialog.locator('.gift-card--earned')).toContainText('0 ₽');
  await expect(dialog.locator('.total-row')).toContainText('3 250');
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
  await expect(dialog.locator('.total-row')).toContainText('2 600');
});

test('five portions on one day do not earn the weekly gift', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Состав обеда Куриная котлета' }).click();
  const dialog = page.getByRole('dialog');
  for (let index = 0; index < 4; index++) await dialog.getByRole('button', { name: 'Увеличить: Куриная котлета', exact: true }).click();
  await dialog.getByRole('button', { name: /Добавить ·/ }).click();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 5' }).click();
  await expect(dialog.locator('.gift-card--earned')).toHaveCount(0);
  await expect(dialog.locator('.gift-card')).toContainText('Выбрано дней: 1 из 5');
  await expect(dialog.locator('.total-row')).toContainText('2 750');
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
