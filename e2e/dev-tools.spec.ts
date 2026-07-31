import { test, expect } from '@playwright/test';
import { gotoFreshGame, openDevTools, seedSave } from './helpers';

test.describe('Dev Tools', () => {
  test('grants the chosen amount of every currency', async ({ page }) => {
    await gotoFreshGame(page);
    await openDevTools(page);

    await page.click('button:has-text("+100 all")');
    await page.keyboard.press('Escape');

    await expect(page.locator('.vault-row', { hasText: 'GOLD' }).locator('.vault-amount')).toHaveText('100');
    await expect(page.locator('.vault-row', { hasText: 'HERBS' }).locator('.vault-amount')).toHaveText('100');
  });

  test('Unlock All Systems reveals the Jacks/Crown nav buttons', async ({ page }) => {
    await gotoFreshGame(page);
    await expect(page.locator('.nav-btn', { hasText: 'Jacks' })).toHaveCount(0);

    await openDevTools(page);
    await page.click('button:has-text("Unlock All Systems")');
    await page.keyboard.press('Escape');

    await expect(page.locator('.nav-btn', { hasText: 'Jacks' })).toBeVisible();
    await expect(page.locator('.nav-btn', { hasText: 'Crown' })).toBeVisible();
  });

  test('Give Sword adds a Basic Sword to the Fighter\'s inventory', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);
    await openDevTools(page);

    await page.click('button:has-text("Give Sword")');
    await page.keyboard.press('Escape');

    const slot = page.locator('app-inventory-panel .inventory-slot');
    await expect(slot).toBeVisible();
    await slot.hover();
    await expect(page.locator('.tooltip-box')).toContainText('Basic Sword');
  });

  test('Delete Save resets to a fresh game with no confirmation prompt', async ({ page }) => {
    await gotoFreshGame(page);
    await page.click('button.primary-button');
    await expect(page.locator('.vault-row', { hasText: 'GOLD' }).locator('.vault-amount')).toHaveText('1');

    await openDevTools(page);
    await page.click('button:has-text("Delete Save")');

    await page.waitForSelector('button.primary-button');
    await expect(page.locator('.vault-row', { hasText: 'GOLD' })).toHaveCount(0); // back to locked/unearned
  });
});
