import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoFreshGame, seedSave, seedBlacksmithForgeReadySave, openDevTools } from './helpers';

/**
 * Automated accessibility regression gate — see AGENTS.md §19 Accessibility. Scans a
 * handful of structurally-distinct screens/states, not every screen combinatorially.
 * `color-contrast` is deliberately excluded: this game's dark terminal palette (muted
 * grays on near-black, AGENTS.md §3) predates this check and reworking it is a visual
 * redesign, explicitly out of scope for the accessibility retrofit — see
 * docs/superpowers/specs/2026-10-27-accessibility-retrofit-design.md's Non-goals.
 */
async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
}

test.describe('Accessibility', () => {
  test('fresh game, default screen', async ({ page }) => {
    await gotoFreshGame(page);
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('Fighter Combat active', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);
    await expect(page.locator('app-fighter-combat')).toBeVisible();

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('Blacksmith Forge active', async ({ page }) => {
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);
    await expect(page.locator('app-blacksmith-forge')).toBeVisible();

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  for (const modal of [
    { label: 'Options', selector: '.options-panel' },
    { label: 'Stats', selector: '.stats-panel' },
  ] as const) {
    test(`${modal.label} modal open`, async ({ page }) => {
      await gotoFreshGame(page);
      await page.click(`text=${modal.label}`);
      await expect(page.locator(modal.selector)).toBeVisible();

      const results = await scan(page);
      expect(results.violations).toEqual([]);
    });
  }

  test('Dev Tools modal open', async ({ page }) => {
    await gotoFreshGame(page);
    await openDevTools(page);

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});
