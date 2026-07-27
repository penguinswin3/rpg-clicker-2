import { test, expect } from '@playwright/test';
import { gotoFreshGame, trackConsoleErrors } from './helpers';

test.describe('Smoke test', () => {
  test('boots a fresh game with every top-level region visible and no console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);

    await gotoFreshGame(page);

    await expect(page.locator('text=[ PARTY VAULT ]')).toBeVisible();
    await expect(page.locator('text=[ QUESTS ]')).toBeVisible();
    await expect(page.locator('text=[ ACTIVITY LOG ]')).toBeVisible();
    await expect(page.locator('.character-box', { hasText: 'Fighter' })).toBeVisible();
    await expect(page.locator('button.primary-button')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Fighter is selected by default and Ranger is not yet unlocked', async ({ page }) => {
    await gotoFreshGame(page);
    await expect(page.locator('.character-box.active')).toHaveText('Fighter');
    await expect(page.locator('.character-box', { hasText: 'Ranger' })).toHaveCount(0);
  });

  test('reloading preserves state (a save actually persists)', async ({ page }) => {
    await gotoFreshGame(page);
    await page.click('button.primary-button');
    const goldAfterClick = await page.locator('.vault-entry', { hasText: 'GOLD' }).locator('.vault-amount').innerText();

    await page.reload();
    await page.waitForSelector('button.primary-button');
    const goldAfterReload = await page.locator('.vault-entry', { hasText: 'GOLD' }).locator('.vault-amount').innerText();

    expect(goldAfterReload).toBe(goldAfterClick);
  });
});
