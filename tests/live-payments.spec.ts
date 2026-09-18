import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext } from '@playwright/test';
import WebSocket from 'ws';
import { deliveryDays } from '../src/lib/order';
import { mealsForDate } from '../src/data/menu';

const origin = 'http://127.0.0.1:3007';
const fixture = 'http://127.0.0.1:3099';
test.skip(({ baseURL }) => baseURL !== origin, 'Local live-mode contract suite only');
const customer = { name: 'Тестовый покупатель', phone: '79990000000', email: 'fixture@example.invalid', address: { city: 'Ялта', street: 'Тестовая улица, 1', office: '2', floor: '3' }, slot: '12:00–13:00' };
async function input(request: APIRequestContext) {
  await request.post('/api/payments/session', { headers: { Origin: origin } });
  const catalog = await (await request.get('/api/menu')).json();
  const day = deliveryDays(new Date(), catalog)[0];
  return { id: randomUUID(), items: [{ mealId: mealsForDate(day.value, catalog)[0].id, date: day.value, quantity: 1 }], expectedTotal: 65000, customer };
}
async function create(request: APIRequestContext, data: unknown) { return request.post('/api/payments', { headers: { Origin: origin }, data }); }
async function mode(request: APIRequestContext, mode: string) { await request.post(`${fixture}/control`, { data: { mode } }); }
async function view(request: APIRequestContext, id: string) { return (await request.get(`/api/payments/${id}`)).json(); }
async function sent(request: APIRequestContext, payment: { paymentUrl: string }) { return (await request.get(`${fixture}/inspect/${payment.paymentUrl.split('/').pop()}`)).json(); }
async function owner(request: APIRequestContext) { expect((await request.post('/api/admin/session', { headers: { Origin: origin }, data: { password: 'local-owner-fixture' } })).ok()).toBeTruthy(); }
async function change(request: APIRequestContext, id: string, action: string) { return request.post(`/api/admin/orders/${id}`, { headers: { Origin: origin }, data: { mode: 'live', action } }); }

test('live orders are encrypted, deduplicated across tabs and only confirmed by GET', async ({ request, playwright }) => {
  await mode(request, 'pending'); const data = await input(request);
  expect((await create(request, { ...data, customer: undefined })).status()).toBe(400);
  const payment = await (await create(request, data)).json(); expect(payment).toMatchObject({ state: 'pending', mode: 'live' });
  expect((await (await create(request, { ...data, id: randomUUID() })).json()).id).toBe(data.id);
  const other = await create(request, { ...data, id: randomUUID(), customer: { ...customer, name: 'Другой покупатель' } });
  expect(other.status()).toBe(409); expect((await other.json()).paymentId).toBe(data.id);
  const provider = await sent(request, payment);
  expect(provider.customer_email).toBe(customer.email);
  expect(provider.nomenclature[0].payment_method).toBe(1);
  const operation = payment.paymentUrl.split('/').pop();
  expect((await request.post(provider.notification_url, { data: { id: operation, operation_status_code: 5 } })).ok()).toBeTruthy();
  expect((await view(request, data.id)).state).toBe('pending');
  const disk = await readFile(`.local-menu/${process.env.MENU_LOCAL_NAMESPACE}/cms/payments/live/${data.id}.sealed`, 'utf8');
  expect(disk).not.toContain(customer.phone); expect(disk).not.toContain(customer.email);
  expect(JSON.stringify(payment)).not.toContain(customer.phone);
  const stranger = await playwright.request.newContext({ baseURL: origin });
  expect((await stranger.get(`/api/payments/${data.id}`)).status()).toBe(401);
  expect((await stranger.get('/api/admin/orders?day=2026-09-18')).status()).toBe(401);
  await stranger.dispose();
  await owner(request); expect((await change(request, data.id, 'accepted')).status()).toBe(409);
  await request.post(`${fixture}/update/${operation}`, { data: { mode: 'paid' } });
  expect((await request.post(provider.notification_url, { data: { id: operation, operation_status_code: 6 } })).ok()).toBeTruthy();
  const paid = await view(request, data.id); expect(paid.state).toBe('paid');
  await request.post(`${fixture}/update/${operation}`, { data: { mode: 'cancelled' } });
  await request.post(provider.notification_url, { data: { id: operation, operation_status_code: 6 } });
  expect((await view(request, data.id)).paidAt).toBe(paid.paidAt);
  expect((await change(request, data.id, 'completed')).status()).toBe(409);
  expect((await change(request, data.id, 'accepted')).ok()).toBeTruthy();
  expect((await change(request, data.id, 'completed')).ok()).toBeTruthy();
  expect((await view(request, data.id)).fulfillment).toBe('completed');
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Simferopol' }).format(new Date());
  const inbox = await (await request.get(`/api/admin/orders?day=${day}&mode=live`)).json();
  expect(inbox.orders.find((order: { id: string }) => order.id === data.id).customer).toEqual(customer);
});

for (const scenario of ['early-webhook', 'lost-response']) test(`recovers ${scenario} without repeating provider POST`, async ({ request }) => {
  await mode(request, scenario); const data = await input(request);
  const payment = await (await create(request, data)).json(); expect(payment.state).toBe('paid');
  await create(request, data);
  expect((await (await request.get(`${fixture}/control`)).json()).count).toBe(1);
});

test('durable worker verifies an order after customer leaves, without webhook', async ({ request }) => {
  await mode(request, 'pending'); const data = await input(request);
  const payment = await (await create(request, data)).json();
  await request.post(`${fixture}/update/${payment.paymentUrl.split('/').pop()}`, { data: { mode: 'paid' } });
  await expect.poll(async () => (await view(request, data.id)).state, { timeout: 40000, intervals: [2000] }).toBe('paid');
  expect((await request.post('/api/internal/payments/reconcile', { data: { mode: 'live' } })).status()).toBe(403);
});

test('terminal without fiscalization receives no email or receipt lines', async ({ request }) => {
  await mode(request, 'no-receipt'); const data = await input(request);
  const payment = await (await create(request, data)).json();
  const provider = await sent(request, payment);
  expect(provider.sum).toBe(65000);
  expect(provider).not.toHaveProperty('customer_email'); expect(provider).not.toHaveProperty('nomenclature');
});

test('expired terminal blocks creation before provider POST', async ({ request }) => {
  await mode(request, 'expired-terminal'); const data = await input(request);
  const response = await create(request, data); expect(response.status()).toBe(503);
  expect((await response.json()).error).toContain('Оплата временно недоступна');
  expect((await (await request.get(`${fixture}/control`)).json()).count).toBe(0);
  expect((await request.get(`/api/payments/${data.id}`)).status()).toBe(404);
});

test('provider rejection is visible only to owner with secret redacted', async ({ request }) => {
  await mode(request, 'provider-error'); const data = await input(request);
  const payment = await (await create(request, data)).json();
  expect(payment.state).toBe('failed'); expect(payment).not.toHaveProperty('reviewReason');
  await owner(request);
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Simferopol' }).format(new Date());
  const inbox = await (await request.get(`/api/admin/orders?day=${day}&mode=live`)).json();
  const reason = inbox.orders.find((order: { id: string }) => order.id === data.id).reviewReason;
  expect(reason).toContain('HTTP 400'); expect(reason).not.toContain('local-fixture-key');
});

test('status diagnostics stay private and clear after verified recovery', async ({ request }) => {
  await mode(request, 'pending'); const data = await input(request);
  const payment = await (await create(request, data)).json(); const provider = await sent(request, payment);
  const operation = payment.paymentUrl.split('/').pop();
  await owner(request);
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Simferopol' }).format(new Date());
  for (const [scenario, detail] of [['webhook-get-failure', 'HTTP 503'], ['status-malformed', 'invalid fields']]) {
    await request.post(`${fixture}/update/${operation}`, { data: { mode: scenario } });
    expect((await request.post(provider.notification_url, { data: { id: operation, operation_status_code: 5 } })).status()).toBe(502);
    const publicView = await view(request, data.id);
    expect(publicView.state).toBe('pending'); expect(publicView).not.toHaveProperty('reviewReason');
    const inbox = await (await request.get(`/api/admin/orders?day=${day}&mode=live`)).json();
    const reason = inbox.orders.find((order: { id: string }) => order.id === data.id).reviewReason;
    expect(reason).toContain(detail); expect(reason).not.toContain('local-fixture-key'); expect(reason).not.toContain('private-customer');
  }
  await request.post(`${fixture}/update/${operation}`, { data: { mode: 'pending' } });
  expect((await request.post(provider.notification_url, { data: { id: operation, operation_status_code: 5 } })).ok()).toBeTruthy();
  const inbox = await (await request.get(`/api/admin/orders?day=${day}&mode=live`)).json();
  const recovered = inbox.orders.find((order: { id: string }) => order.id === data.id);
  expect(recovered.state).toBe('pending'); expect(recovered.verifiedAt).toBeTruthy(); expect(recovered.reviewReason).toBeUndefined();
});

test('owner can wait for a slow status stream and verify its amount', async ({ request }) => {
  await mode(request, 'slow-status'); const data = await input(request);
  await create(request, data); await owner(request);
  const response = await change(request, data.id, 'refresh');
  expect(response.status()).toBe(200); const verified = await response.json();
  expect(verified.state).toBe('paid'); expect(verified.verifiedAt).toBeTruthy();
});

test('worker retains webhook UUID when creation response and first GET fail', async ({ request }) => {
  await mode(request, 'webhook-get-failure'); const data = await input(request);
  expect((await (await create(request, data)).json()).state).toBe('unknown');
  const { lastId } = await (await request.get(`${fixture}/control`)).json();
  await request.post(`${fixture}/update/${lastId}`, { data: { mode: 'paid' } });
  await expect.poll(async () => (await view(request, data.id)).state, { timeout: 40000, intervals: [2000] }).toBe('paid');
  expect((await (await request.get(`${fixture}/control`)).json()).count).toBe(1);
});

test('WebSocket rejects a foreign origin and a different browser', async ({ request, playwright }) => {
  await mode(request, 'pending'); const data = await input(request); await create(request, data);
  const cookie = (await request.storageState()).cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  async function rejected(origin: string, cookie: string) {
    return new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:3007/api/payments/ws?id=${data.id}`, { origin, headers: { cookie } });
      ws.on('unexpected-response', (_, response) => { response.resume(); ws.terminate(); resolve(response.statusCode!); });
      ws.on('open', () => { ws.close(); reject(new Error('Unauthorized socket opened')); });
      ws.on('error', () => {});
    });
  }
  expect(await rejected('https://foreign.invalid', cookie)).toBe(403);
  const stranger = await playwright.request.newContext({ baseURL: origin });
  await stranger.post('/api/payments/session', { headers: { Origin: origin } });
  const otherCookie = (await stranger.storageState()).cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  expect(await rejected(origin, otherCookie)).toBe(401); await stranger.dispose();
});

test('checkout, WebSocket webhook update, owner acceptance work on phones and desktop', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await mode(page.request, 'pending'); await page.goto('/');
  await page.locator('.meal-card').getByRole('button', { name: /Добавить/ }).click();
  if (info.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 1' }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Оформить заказ' }).click();
  await dialog.getByLabel('Улица и дом', { exact: true }).fill(customer.address.street);
  await dialog.getByLabel('Имя', { exact: true }).fill(customer.name);
  await dialog.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await dialog.getByLabel('Электронная почта').fill(customer.email);
  const frames: string[] = [];
  page.on('websocket', (socket) => { if (socket.url().includes('/api/payments/ws')) socket.on('framereceived', (event) => frames.push(String(event.payload))); });
  await dialog.getByRole('button', { name: 'Перейти к оплате', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ожидаем оплату' })).toBeVisible();
  await expect(page.getByAltText('QR-код оплаты СБП')).toBeVisible();
  const id = page.url().split('/').pop()!; const payment = await view(page.request, id); const provider = await sent(page.request, payment);
  expect(await page.evaluate(() => sessionStorage.getItem('chaika-payment-attempt'))).not.toContain(customer.email);
  await expect.poll(() => frames.some((frame) => frame.includes('"state":"pending"'))).toBeTruthy();
  await page.request.post(`${fixture}/update/${payment.paymentUrl.split('/').pop()}`, { data: { mode: 'paid' } });
  await page.request.post(provider.notification_url, { data: { id: payment.paymentUrl.split('/').pop(), operation_status_code: 5 } });
  await expect.poll(() => frames.some((frame) => frame.includes('"state":"paid"')), { timeout: 20000 }).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Заказ оплачен', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chaika-lunch-cart-v1') || '[]'))).toEqual([]);
  await page.screenshot({ path: `research/qrmanager/live-paid-${info.project.name}.png`, fullPage: true });
  await owner(page.request); await page.goto('/admin/orders');
  const card = page.locator('.owner-order').filter({ hasText: id.slice(0, 8) });
  await expect(card.getByText(customer.name, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Принять в работу' }).click();
  await expect(card.getByRole('button', { name: 'Отметить выполненным' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `research/qrmanager/orders-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('GET fallback confirms payment when WebSocket is unavailable', async ({ page }) => {
  await mode(page.request, 'pending'); const data = await input(page.request);
  const payment = await (await create(page.request, data)).json();
  await page.routeWebSocket('**/api/payments/ws?*', (socket) => socket.close());
  await page.goto(`/payment/${data.id}`); await expect(page.getByRole('heading', { name: 'Ожидаем оплату' })).toBeVisible();
  await page.request.post(`${fixture}/update/${payment.paymentUrl.split('/').pop()}`, { data: { mode: 'paid' } });
  await expect(page.getByRole('heading', { name: 'Заказ оплачен', exact: true })).toBeVisible({ timeout: 20000 });
});
