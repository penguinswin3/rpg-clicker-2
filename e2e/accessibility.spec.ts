import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  gotoFreshGame,
  seedSave,
  seedBlacksmithForgeReadySave,
  openDevTools,
  openResetSaveConfirm,
  startFight,
  showTooltip,
} from './helpers';

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

  // The states above are all "structurally distinct screen, nothing in it yet." The four
  // below exist because the retrofit's per-element work (inventory slot labels, the
  // Confirm panel's own structure, combat's aria-hidden ASCII/HP fills, a live tooltip)
  // lives in content that only appears once something is actually populated or open —
  // none of it was reachable by any scan above.

  test('an inventory item present (labelled .inventory-slot)', async ({ page }) => {
    await seedSave(page, {
      unlocks: { minigames: true },
      equipment: { inventory: { 'ring-swift-strike': 1 }, equipped: {} },
    });
    await gotoFreshGame(page);
    await expect(page.locator('app-inventory-panel .inventory-slot')).not.toHaveCount(0);

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  // The one modal with genuinely different internal structure from the panel-style ones
  // above — and the one reached by swapping content inside an already-open modal rather
  // than opening a fresh one (see UiModalComponent's content-change refocus).
  test('Confirm modal open (reached from Options -> Reset Save)', async ({ page }) => {
    await gotoFreshGame(page);
    await openResetSaveConfirm(page);

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('an active combat encounter', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);
    await startFight(page);

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('an open tooltip', async ({ page }) => {
    await gotoFreshGame(page);
    await showTooltip(page, 'button.primary-button');

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});
