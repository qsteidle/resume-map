import { test, expect } from '@playwright/test';

const hiddenCount = (page) =>
  page.$$eval('.map-marker', (els) => els.filter((e) => getComputedStyle(e).display === 'none').length);

test.describe('Resume map', () => {
  test('category filter hides non-matching markers; All restores them', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.map-marker').length > 0, null, {
      timeout: 15_000,
    });
    await page.waitForTimeout(500); // let markers settle

    // No filter → nothing hidden.
    expect(await hiddenCount(page)).toBe(0);

    // A single category hides the rest but keeps its own visible.
    await page.locator('#filters .pill', { hasText: 'Sports' }).click();
    await page.waitForTimeout(400);
    expect(await hiddenCount(page)).toBeGreaterThan(0);
    expect(await page.locator('.map-marker:visible').count()).toBeGreaterThan(0);

    // Back to All → everything visible again.
    await page.locator('#filters .pill', { hasText: /^All$/ }).click();
    await page.waitForTimeout(400);
    expect(await hiddenCount(page)).toBe(0);
  });

  test('Greece minimap hides under a non-education filter', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.map-marker').length > 0, null, {
      timeout: 15_000,
    });
    const mm = page.locator('#greece-minimap');

    // Engineering excludes Athens (education) → inset hidden.
    await page.locator('#filters .pill', { hasText: 'Engineering' }).click();
    await page.waitForTimeout(300);
    await expect(mm).toHaveClass(/is-hidden/);

    // Education includes Athens → inset shown again.
    await page.locator('#filters .pill', { hasText: 'Education' }).click();
    await page.waitForTimeout(300);
    await expect(mm).not.toHaveClass(/is-hidden/);
  });
});
