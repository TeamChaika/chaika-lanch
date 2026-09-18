import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { deliveryDays } from '../src/lib/order';
import { mealsForDate } from '../src/data/menu';

const origin = 'http://127.0.0.1:3006';
test.skip(({ baseURL }) => baseURL !== origin, 'Isolated payment fixture only');
async function mode(request: APIRequestContext, value: string) { await request.post('http://127.0.0.1:3099/control', { data: { mode: value } }); }
async function input(request: APIRequestContext, week = false) {
  await request.post('/api/payments/session', { headers: { Origin: origin } });
  const catalog = await (await request.get('/api/menu')).json();
  const days = deliveryDays(new Date(), catalog).slice(0, week ? 5 : 1);
  return { id: randomUUID(), items: days.map((day) => ({ mealId: mealsForDate(day.value, catalog)[0].id, date: day.value, quantity: 1 })), expectedTotal: days.length * 65000 };
}
async function create(request: APIRequestContext, data: unknown) { return request.post('/api/payments', { headers: { Origin: origin }, data }); }

test('server pricing, concurrent idempotency, protected records and encrypted storage', async ({ request, playwright }) => {
  await mode(request, 'paid'); const data = await input(request, true);
  const invalid = await create(request, { ...data, expectedTotal: 1 }); expect(invalid.status()).toBe(409);
  const responses = await Promise.all([create(request, data), create(request, data)]);
  for (const response of responses) expect(response.ok()).toBeTruthy();
  const saved = await (await request.get(`/api/payments/${data.id}`)).json();
  expect(saved).toMatchObject({ state: 'pending', total: 3250, delivery: 500, gift: true });
  expect(saved.qrImage).toMatch(/^data:image\/png;base64,/);
  const operationId = saved.paymentUrl.split('/').pop();
  const sent = await (await request.get(`http://127.0.0.1:3099/inspect/${operationId}`)).json();
  expect(sent.sum).toBe(325000);
  expect(sent.nomenclature.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0)).toBe(sent.sum);
  expect(sent).not.toHaveProperty('delivery_address'); expect(sent).not.toHaveProperty('customer_email');
  expect((await (await request.get('http://127.0.0.1:3099/control')).json()).count).toBe(1);
  // A valid callback still cannot dictate the status; QRM's SSE result is authoritative.
  const callback = await request.post(sent.notification_url, { data: { id: operationId, operation_status_code: 6 } });
  expect(callback.ok()).toBeTruthy();
  expect((await (await request.get(`/api/payments/${data.id}`)).json()).state).toBe('paid');
  expect((await request.post(sent.notification_url, { data: { id: operationId, operation_status_code: 6 } })).ok()).toBeTruthy();
  expect((await request.post(sent.notification_url, { data: { id: randomUUID() } })).status()).toBe(400);
  const stranger = await playwright.request.newContext({ baseURL: origin });
  expect((await stranger.get(`/api/payments/${data.id}`)).status()).toBe(401);
  await stranger.post('/api/payments/session', { headers: { Origin: origin } });
  expect((await stranger.get(`/api/payments/${data.id}`)).status()).toBe(404);
  await stranger.dispose();
  const disk = await readFile(`.local-menu/cms/payments/sandbox/${data.id}.sealed`, 'utf8');
  expect(disk).not.toContain('sandbox-payment'); expect(disk).not.toContain(data.items[0].mealId);
  expect(JSON.stringify(saved)).not.toContain('local-fixture-key');
});

for (const [fixture, expected] of [['cancelled', 'cancelled'], ['expired', 'expired'], ['sse-timeout', 'pending'], ['provider-error', 'failed'], ['malformed', 'unknown']] as const) {
  test(`provider ${fixture} has honest status and no repeated creation`, async ({ request }) => {
    await mode(request, fixture); const data = await input(request);
    await create(request, data); await create(request, data);
    const response = await request.post(`/api/payments/${data.id}`, { headers: { Origin: origin } });
    expect((await response.json()).state).toBe(expected);
    expect((await (await request.get('http://127.0.0.1:3099/control')).json()).count).toBe(1);
  });
}

test('rejects wrong sum, forged callback, cross-site POST and unavailable dishes', async ({ request }) => {
  await mode(request, 'mismatch'); const data = await input(request);
  expect((await create(request, { ...data, items: [{ ...data.items[0], mealId: 'unknown' }] })).status()).toBe(409);
  expect((await create(request, { ...data, items: [data.items[0], data.items[0]] })).status()).toBe(409);
  expect((await request.post('/api/payments', { headers: { Origin: 'https://evil.example' }, data })).status()).toBe(403);
  await create(request, data);
  expect((await request.post(`/api/payments/${data.id}`, { headers: { Origin: origin } })).status()).toBe(502);
  expect((await request.post(`/api/payments/${data.id}/webhook?token=${'0'.repeat(64)}`, { data: { id: randomUUID(), operation_status_code: 5 } })).status()).toBe(403);
  expect((await (await request.get(`/api/payments/${data.id}`)).json()).state).toBe('pending');
});

test('mobile and desktop checkout reaches QR and verified paid state after reload', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mode(page.request, 'paid'); await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(1);
  await page.locator('.meal-card').getByRole('button', { name: /Добавить/ }).click();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 1' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(dialog.getByText(/Тест QR Manager: деньги не списываются/)).toBeVisible();
  await dialog.getByLabel('Улица и дом', { exact: true }).fill('Тестовая улица, 1');
  await dialog.getByLabel('Имя', { exact: true }).fill('Тест');
  await dialog.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await dialog.getByRole('button', { name: 'Перейти к тестовой оплате' }).click();
  await expect(page).toHaveURL(/\/payment\/[\w-]+/);
  await expect(page.getByAltText('QR-код тестового платежа СБП')).toBeVisible();
  await page.screenshot({ path: `research/qrmanager/qr-${testInfo.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Тестовая оплата подтверждена' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Без списания денег и реальной доставки.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `research/qrmanager/paid-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chaika-lunch-cart-v1') || '[]'))).toEqual([]);
  await page.getByRole('link', { name: 'Вернуться в меню' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.meal-card').getByRole('button', { name: 'Добавить', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('provider error is visible and preserves the cart', async ({ page }) => {
  await mode(page.request, 'provider-error');
  const data = await input(page.request); await create(page.request, data);
  await page.goto(`/payment/${data.id}`);
  await page.evaluate((items) => localStorage.setItem('chaika-lunch-cart-v1', JSON.stringify(items)), data.items);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Тестовый сервис временно недоступен' })).toBeVisible();
  await expect(page.getByText(/QR Manager отклонил/)).toBeVisible();
  await expect(page.getByAltText('QR-код тестового платежа СБП')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chaika-lunch-cart-v1') || '[]'))).toEqual(data.items);
});

test('limits repeated payment creation per browser', async ({ request }) => {
  await mode(request, 'provider-error'); const data = await input(request);
  for (let index = 0; index < 8; index++) expect((await create(request, { ...data, id: randomUUID() })).ok()).toBeTruthy();
  expect((await create(request, { ...data, id: randomUUID() })).status()).toBe(429);
  expect((await (await request.get('http://127.0.0.1:3099/control')).json()).count).toBe(8);
});
