import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import sharp from 'sharp';
import type { MenuCatalog } from '../src/data/menu';

// Mutating tests are opt-in and may only run against an isolated local server.
const enabled = !!process.env.ADMIN_TEST_PASSWORD_FILE && process.env.CMS_STORAGE_PREFIX?.includes('-test-');
test.skip(!enabled, 'Requires isolated CMS test storage and a temporary password');
test.use({ trace: 'off' }); // Authentication requests contain temporary credentials.
test.describe.configure({ mode: 'serial' });
let baseline: MenuCatalog;
let password: string;
let origin: string;
async function signIn(request: APIRequestContext, value = password) {
  return request.post('/api/admin/session', { headers: { Origin: origin }, data: { password: value } });
}
async function restore(request: APIRequestContext) {
  await signIn(request);
  const current = await (await request.get('/api/admin/menu')).json();
  const response = await request.put('/api/admin/menu', { headers: { Origin: origin }, data: { ...baseline, revision: current.revision } });
  expect(response.status()).toBe(200);
}
test.beforeAll(async ({ request, baseURL }) => {
  if (!enabled) return;
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Admin tests require localhost');
  origin = baseURL;
  password = fs.readFileSync(process.env.ADMIN_TEST_PASSWORD_FILE!, 'utf8').trim();
  expect((await signIn(request)).status()).toBe(200);
  baseline = await (await request.get('/api/admin/menu')).json();
});
test.afterEach(async ({ request }) => { if (enabled && baseline) await restore(request); });

test('owner edits dishes, price, days and photos; publication survives reload', async ({ page, request }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-09-21T09:00:00+03:00') });
  await page.goto('/admin');
  await page.getByLabel('Пароль владельца', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в админку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что будем готовить?' })).toBeVisible();
  await expect.poll(() => page.locator('.admin-photo-editor > img').first().evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20000 }).toBeGreaterThan(0);
  await page.screenshot({ path: `research/admin/ready-${info.project.name}.png`, fullPage: true });
  await page.getByLabel('Название комплекса', { exact: true }).fill('Тестовый обед владельца');
  await page.getByLabel('Цена, ₽', { exact: true }).fill('575');
  await page.getByLabel('Название позиции 1', { exact: true }).fill('Свежий салат из тестового меню');
  const photo = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#e0aa52' } }).jpeg().toBuffer();
  await page.getByLabel('Загрузить фото: Тестовый обед владельца', { exact: true }).setInputFiles({ name: 'owner-photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByText(/Фото готово: WebP/)).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Опубликовать меню', exact: true }).click();
  await expect(page.getByText(/Меню опубликовано. Посетители/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Название комплекса', { exact: true })).toHaveValue('Тестовый обед владельца');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `research/admin/admin-${info.project.name}.png`, fullPage: true });
  const menu = await (await request.get('/api/menu')).json();
  const meal = menu.meals.find((value: {id: string}) => value.id === baseline.meals[0].id);
  expect(meal.imageVariants.length).toBeGreaterThan(2);
  expect(meal.imageVariants.every((value: {path: string; width: number}) => value.path.endsWith('.webp') && value.width <= 1280)).toBe(true);
  await page.goto('/');
  await expect(page.locator('.meal-title')).toHaveText('Тестовый обед владельца');
  await expect(page.locator('.meal-composition')).toContainText('Свежий салат из тестового меню');
  await expect(page.locator('.meal-card-bottom')).toContainText('575');
  await expect.poll(() => page.locator('.meal-photo').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  if (info.project.name === 'mobile') await page.locator('.mobile-cart-bar').click();
  else await page.getByRole('button', { name: 'Корзина, товаров: 1', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.total-row')).toContainText('575');
  await page.keyboard.press('Escape');
  await page.goto('/admin');
  await page.getByLabel('День доступен для заказа', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Опубликовать меню', exact: true }).click();
  await expect(page.getByText(/Меню опубликовано. Посетители/)).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('На этот день обедов пока нет. Выберите другой день.')).toBeVisible();
  await expect(page.locator('.meal-card')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('chaika-lunch-cart-v1') || '[]').length)).toBe(0);
  expect(errors).toEqual([]);
});

test('authorization, CSRF, validation and optimistic concurrency are enforced', async ({ request, playwright, baseURL }) => {
  test.setTimeout(90000);
  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    expect((await anonymous.get('/api/admin/menu')).status()).toBe(401);
    expect((await anonymous.put('/api/admin/menu', { headers: { Origin: origin }, data: baseline })).status()).toBe(401);
    expect((await anonymous.post('/api/admin/images', { headers: { Origin: origin, 'Content-Type': 'image/jpeg' }, data: Buffer.from('bad') })).status()).toBe(401);
    expect((await anonymous.post('/api/admin/session', { data: { password } })).status()).toBe(403);
    expect((await anonymous.post('/api/admin/session', { headers: { Origin: 'https://attacker.example' }, data: { password } })).status()).toBe(403);
    expect((await signIn(anonymous, 'not-the-owner-password')).status()).toBe(401);
    expect((await signIn(request)).status()).toBe(200);
    const before = await (await request.get('/api/admin/menu')).json();
    const invalid = structuredClone(before); invalid.meals[0].price = -1;
    expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: invalid })).status()).toBe(400);
    invalid.meals[0].price = 550; invalid.cycleStartsOn = '2026-09-22';
    expect((await request.put('/api/admin/menu', { headers: { Origin: origin }, data: invalid })).status()).toBe(400);
    const payloads = [structuredClone(before), structuredClone(before)];
    payloads[0].meals[0].name = 'Revision A'; payloads[1].meals[0].name = 'Revision B';
    const results = await Promise.all(payloads.map((data) => request.put('/api/admin/menu', { headers: { Origin: origin }, data })));
    expect(results.map((result) => result.status()).sort()).toEqual([200, 409]);
    expect((await request.post('/api/admin/images', { headers: { Origin: origin, 'Content-Type': 'image/svg+xml' }, data: '<svg/>' })).status()).toBe(415);
    expect((await request.post('/api/admin/images', { headers: { Origin: origin, 'Content-Type': 'image/jpeg' }, data: 'not an image' })).status()).toBe(400);
    expect((await request.post('/api/admin/images', { headers: { Origin: origin, 'Content-Type': 'image/jpeg' }, data: Buffer.alloc(12 * 1024 * 1024 + 1) })).status()).toBe(413);
    const session = await request.storageState();
    const cookie = session.cookies.find((value) => value.name === 'chaika_owner')!;
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
    const copiedSession = await playwright.request.newContext({ baseURL, storageState: session });
    expect((await request.delete('/api/admin/session', { headers: { Origin: origin } })).status()).toBe(200);
    expect((await copiedSession.get('/api/admin/menu')).status()).toBe(401);
    await copiedSession.dispose();
  } finally { await anonymous.dispose(); }
});

test('password changes invalidate other sessions and remain after a fresh login', async ({ request, playwright, baseURL }) => {
  const second = await playwright.request.newContext({ baseURL });
  const nextPassword = `${password}-changed`;
  let changed = false;
  try {
    expect((await signIn(request)).status()).toBe(200);
    expect((await signIn(second)).status()).toBe(200);
    const response = await request.put('/api/admin/password', { headers: { Origin: origin }, data: { currentPassword: password, newPassword: nextPassword } });
    expect(response.status()).toBe(200); changed = true;
    expect((await second.get('/api/admin/menu')).status()).toBe(401);
    expect((await signIn(second, password)).status()).toBe(401);
    expect((await signIn(second, nextPassword)).status()).toBe(200);
  } finally {
    if (changed) {
      expect((await signIn(request, nextPassword)).status()).toBe(200);
      expect((await request.put('/api/admin/password', { headers: { Origin: origin }, data: { currentPassword: nextPassword, newPassword: password } })).status()).toBe(200);
    }
    await second.dispose();
  }
});

test('password attempt limit is persisted in encrypted storage', async ({ playwright, baseURL }) => {
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { Agent } = await import('node:https');
  const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: 'ru-1', forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { httpsAgent: new Agent({ keepAlive: true }), requestTimeout: 15000, throwOnRequestTimeout: true },
  });
  const object = { Bucket: process.env.S3_BUCKET, Key: `${process.env.CMS_STORAGE_PREFIX}/cms/owner.sealed` };
  const before = await client.send(new GetObjectCommand(object));
  const original = await before.Body!.transformToString();
  expect(original).not.toContain(password);
  expect(original).not.toContain('passwordHash');
  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    for (let attempt = 0; attempt < 8; attempt++) expect((await signIn(anonymous, 'wrong-password')).status()).toBe(401);
    expect((await signIn(anonymous, password)).status()).toBe(429);
    const stored = await client.send(new GetObjectCommand(object));
    const { unsealData } = await import('iron-session');
    const data = await unsealData<{ attempts: number }>(await stored.Body!.transformToString(), { password: process.env.SESSION_SECRET!, ttl: 0 });
    expect(data.attempts).toBe(8);
  } finally {
    // This prefix is exclusively test-owned; restore so the test cannot lock out later checks.
    await client.send(new PutObjectCommand({ ...object, Body: original, CacheControl: 'no-store', ContentType: 'application/octet-stream' }));
    await anonymous.dispose(); client.destroy();
  }
});
