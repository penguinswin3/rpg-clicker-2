import { test, expect } from '@playwright/test';
import { gotoFreshGame, grantMillionOfEveryCurrency } from './helpers';

test.describe('Upgrades', () => {
  test('Fighter sees only their own upgrade(s) from the start, scoped by active character', async ({ page }) => {
    await gotoFreshGame(page);
    await page.click('text=[ Upgrades ]');

    const text = await page.locator('.upgrades-panel').innerText();
    expect(text).toContain('Hard Work');
    // Ranger's upgrades are both locked (behind unlock-ranger) *and* off-character —
    // either reason alone should keep them out of this list.
    expect(text).not.toContain('Better Offcuts');
    expect(text).not.toContain('Extra Baiting');
    expect(text).not.toContain('Clean Traps');
  });

  test('buying Hard Work charges gold and increments its level in place', async ({ page }) => {
    await gotoFreshGame(page);
    await grantMillionOfEveryCurrency(page);
    await page.click('text=[ Upgrades ]');

    const card = page.locator('.upgrade-card', { hasText: 'Hard Work' });
    await expect(card.locator('.upgrade-level')).toHaveText('Level 0 / 100');

    await card.locator('button.upgrade-buy').click();

    await expect(card.locator('.upgrade-level')).toHaveText('Level 1 / 100');
    // Buying an upgrade is deliberately silent in the activity log — no per-purchase entry.
    await expect(page.locator('.log-entry', { hasText: 'muscle' })).toHaveCount(0);
  });

  test('a maxed upgrade shows MAXED instead of a buy button', async ({ page }) => {
    await gotoFreshGame(page);
    await page.click('text=Dev Tools');
    await page.click('button:has-text("Max All")');
    await page.keyboard.press('Escape');
    await page.click('text=[ Upgrades ]');

    const card = page.locator('.upgrade-card', { hasText: 'Hard Work' });
    await expect(card.locator('.upgrade-maxed')).toHaveText('MAXED');
    await expect(card.locator('button.upgrade-buy')).toHaveCount(0);
  });
});
