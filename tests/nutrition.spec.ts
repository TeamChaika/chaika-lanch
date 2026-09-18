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
  await page.locator('.admin-total-nutrition').getByLabel('Калории, ккал', { exact: true }).fill('725');
  await page.locator('.admin-total-nutrition').getByLabel('Белки, г', { exact: true }).fill('42.5');
  await page.locator('.admin-total-nutrition').getByLabel('Жиры, г', { exact: true }).fill('0');
  await page.locator('.admin-total-nutrition').getByLabel('Углеводы, г', { exact: true }).fill('96.2');
  await page.locator('.admin-total-nutrition').getByLabel('Приблизительный расчёт', { exact: true }).check();
  await page.getByRole('button', { name: 'Опубликовать меню', exact: true }).click();
  await expect(page.getByText(/Меню опубликовано. Посетители/)).toBeVisible();
  await page.reload();
  await expect(page.locator('.admin-total-nutrition').getByLabel('Белки, г', { exact: true })).toHaveValue('42.5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.admin-total-nutrition .admin-nutrition').screenshot({ path: `research/nutrition/editor-${info.project.name}.png` });
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
  for (const label of ['Калории, ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г']) await page.locator('.admin-total-nutrition').getByLabel(label, { exact: true }).fill('');
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


test('per-dish editing recalculates the full lunch and never publishes a partial total', async ({ request, page }) => {
  const current: MenuCatalog = await (await request.get('/api/admin/menu')).json();
  current.meals[0].nutritionMode = 'dishes';
  current.meals[0].nutrition = { calories: 999, protein: 99, fat: 99, carbs: 99, estimated: false };
  current.meals[0].dishes.forEach(dish => { dish.nutrition = { calories: 100, protein: 10, fat: 2, carbs: 12, estimated: true }; });
  expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: current })).status()).toBe(200);
  const published: MenuCatalog = await (await request.get('/api/menu')).json();
  expect(published.meals[0].nutrition).toEqual({ calories: 400, protein: 40, fat: 8, carbs: 48, estimated: true });
  await page.goto('/admin');
  await page.getByLabel('Пароль владельца', { exact: true }).fill('nutrition-test-owner');
  await page.getByRole('button', { name: 'Войти в админку', exact: true }).click();
  await expect(page.getByLabel('Рассчитывать КБЖУ по блюдам')).toBeChecked();
  await page.locator('.admin-dish-nutrition summary').first().click();
  const firstDish = page.locator('.admin-dish-nutrition').first();
  await firstDish.getByLabel('Калории, ккал', { exact: true }).fill('150');
  await expect(page.locator('.admin-total-nutrition')).toContainText('450 ккал');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Опубликовать меню', exact: true }).click();
  await expect(page.getByText(/Меню опубликовано. Посетители/)).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.meal-card .dish-nutrition')).toHaveCount(4);
  await expect(page.locator('.meal-card .dish-nutrition').first()).toContainText('≈ 150 ккал');
  await expect(page.locator('.meal-card .meal-nutrition')).toContainText('450 ккал');
  await page.locator('.meal-title').click();
  await expect(page.getByRole('dialog').locator('.dish-nutrition')).toHaveCount(4);
  const next: MenuCatalog = await (await request.get('/api/admin/menu')).json();
  next.meals[0].dishes[0].nutrition!.protein = null;
  expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: next })).status()).toBe(400);
  delete next.meals[0].dishes[0].nutrition;
  expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: next })).status()).toBe(200);
  const missing: MenuCatalog = await (await request.get('/api/menu')).json();
  expect(missing.meals[0].nutrition).toBeUndefined();
  await page.goto('/');
  await expect(page.locator('.meal-card .meal-nutrition')).toContainText('Данные уточняются');
});

test('messenger bots receive complete social metadata and private pages remain noindex', async ({ request }) => {
  const response = await request.get('/', { headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' } });
  expect(response.status()).toBe(200);
  const html = await response.text();
  for (const name of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'twitter:card']) expect(html).toContain(`"${name}"`);
  expect(html).toContain('https://lunch.chaika.team/social/chaika-lunch-v2.jpg');
  expect(html).toContain('summary_large_image');
  expect(html).toContain('name="robots" content="index, follow"');
  const image = await request.get('/social/chaika-lunch-v2.jpg');
  expect(image.status()).toBe(200); expect(image.headers()['content-type']).toContain('image/jpeg');
  expect((await image.body()).length).toBeLessThan(300_000);
  for (const route of ['/admin', '/admin/orders', '/payment/00000000-0000-4000-8000-000000000000']) {
    const privateHtml = await (await request.get(route)).text();
    expect(privateHtml).toContain('name="robots" content="noindex, nofollow"');
  }
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://lunch.chaika.team/</loc>');
});
