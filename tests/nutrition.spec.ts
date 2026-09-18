import { expect, test } from '@playwright/test';
import { defaultCatalog, type MenuCatalog } from '../src/data/menu';

const origin = 'http://127.0.0.1:3008';
test.skip(({ baseURL }) => baseURL !== origin, 'Nutrition tests only mutate isolated local storage');

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/admin/session', { headers: { Origin: origin }, data: { password: 'nutrition-test-owner' } })).status()).toBe(200);
  const current = await (await request.get('/api/admin/menu')).json();
  expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: { ...structuredClone(defaultCatalog), revision: current.revision } })).status()).toBe(200);
});

test('owner publishes nutrition, decimals and zero values appear in the card and description', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin');
  await page.getByLabel('Пароль владельца', { exact: true }).fill('nutrition-test-owner');
  await page.getByRole('button', { name: 'Войти в админку', exact: true }).click();
  await page.getByLabel('Калории, ккал', { exact: true }).fill('725');
  await page.getByLabel('Белки, г', { exact: true }).fill('42.5');
  await page.getByLabel('Жиры, г', { exact: true }).fill('0');
  await page.getByLabel('Углеводы, г', { exact: true }).fill('96.2');
  await page.getByLabel('Приблизительный расчёт', { exact: true }).check();
  await page.getByRole('button', { name: 'Опубликовать меню', exact: true }).click();
  await expect(page.getByText(/Меню опубликовано. Посетители/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Белки, г', { exact: true })).toHaveValue('42.5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.admin-nutrition').screenshot({ path: `research/nutrition/editor-${info.project.name}.png` });
  await page.goto('/');
  const card = page.locator('.meal-card .meal-nutrition');
  await expect(card).toContainText('725 ккал'); await expect(card).toContainText('42,5 г'); await expect(card.locator('dd').nth(2)).toHaveText('0 г');
  await expect(card).toContainText('Приблизительные значения');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.meal-card').screenshot({ path: `research/nutrition/card-${info.project.name}.png` });
  await page.locator('.meal-title').click();
  const description = page.getByRole('dialog').locator('.meal-nutrition');
  await expect(description).toContainText('725 ккал'); await expect(description).toContainText('На весь обед с напитком');
  await page.getByRole('dialog').screenshot({ path: `research/nutrition/description-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.goto('/admin');
  for (const label of ['Калории, ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г']) await page.getByLabel(label, { exact: true }).fill('');
  await page.getByRole('button', { name: 'Опубликовать меню', exact: true }).click();
  await expect(page.getByText(/Меню опубликовано. Посетители/)).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.meal-nutrition')).toContainText('Данные уточняются');
  await expect(page.locator('.meal-nutrition dd')).toHaveText(['—', '—', '—', '—']);
  expect(errors).toEqual([]);
});

test('legacy menus remain valid; incomplete or invalid nutrition cannot overwrite published values', async ({ request }) => {
  const before: MenuCatalog = await (await request.get('/api/admin/menu')).json();
  expect(before.meals).toHaveLength(20); expect(before.meals.every(meal => !meal.nutrition)).toBe(true);
  for (const values of [
    { calories: 600, protein: null, fat: 20, carbs: 80, estimated: false },
    { calories: 600, protein: -1, fat: 20, carbs: 80, estimated: false },
    { calories: 600, protein: 40, fat: 20, carbs: 1001, estimated: false },
  ]) {
    const invalid = structuredClone(before); invalid.meals[0].nutrition = values;
    expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: invalid })).status()).toBe(400);
    expect((await (await request.get('/api/menu')).json()).revision).toBe(before.revision);
  }
  const valid = structuredClone(before);
  valid.meals.forEach((meal, index) => { meal.nutrition = { calories: 650 + index, protein: 40, fat: 25, carbs: 75, estimated: false }; });
  expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: valid })).status()).toBe(200);
  const published: MenuCatalog = await (await request.get('/api/menu')).json();
  expect(published.meals.map(meal => meal.nutrition?.calories)).toEqual(Array.from({ length: 20 }, (_, i) => 650 + i));
});
