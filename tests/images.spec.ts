import { expect, test } from '@playwright/test';

test('food photos use responsive WebP and the desktop hero is not fetched on mobile', async ({ page, isMobile }) => {
  const foodRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image' && request.url().includes('/images/')) foodRequests.push(request.url());
  });
  await page.clock.install({ time: new Date('2026-09-21T09:00:00+03:00') });
  await page.goto('/');
  const firstPhoto = page.locator('.meal-photo').first();
  await expect(firstPhoto).toBeVisible();
  await expect.poll(() => firstPhoto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const source = await firstPhoto.evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(source).toMatch(/^https:\/\/s3\.twcstorage\.ru\/.+\.webp$/);
  expect(source).toMatch(isMobile ? /-1280-|-960-/ : /-640-/);
  if (isMobile) {
    expect(await page.locator('.hero-image img').evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/^data:image\/gif/);
  } else {
    await expect.poll(() => page.locator('.hero-image img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1);
  }
  await page.getByRole('button', { name: 'На неделю', exact: true }).click();
  // Wednesday's photo was not on the initial Monday page: test a fresh download,
  // since browsers may reuse a larger cached image for Monday's or the hero's thumbnail.
  const thumbnail = page.locator('.week-row img').nth(2);
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await thumbnail.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/-(160|320)-[a-f0-9]+\.webp$/);
  expect(foodRequests.length).toBeGreaterThan(0);
  expect(foodRequests.every((url) => url.endsWith('.webp'))).toBe(true);
});

test('food photos fall back to local WebP if S3 is unavailable', async ({ page, isMobile }) => {
  await page.route('https://s3.twcstorage.ru/**', (route) => route.abort());
  await page.goto('/');
  const photo = page.locator('.meal-photo').first();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const source = await photo.evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(new URL(source).origin).toBe(new URL(page.url()).origin);
  expect(source).toMatch(/\/images\/optimized\/.+\.webp$/);
  if (!isMobile) {
    await expect.poll(() => page.locator('.hero-image img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 1)).toBe(true);
    expect(new URL(await page.locator('.hero-image img').evaluate((img: HTMLImageElement) => img.currentSrc)).origin).toBe(new URL(page.url()).origin);
  }
});
