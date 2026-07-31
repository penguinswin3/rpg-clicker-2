import { test, expect } from '@playwright/test';
import { gotoFreshGame, seedSave, seedBlacksmithForgeReadySave, patternCraftButton, trackConsoleErrors } from './helpers';

test.describe('Blacksmith Forge minigame', () => {
  test('shows all 5 Common patterns, each craftable, once the Forge unlocks', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);

    await expect(page.locator('app-blacksmith-forge')).toBeVisible();
    await expect(page.locator('.pattern-row')).toHaveCount(5);
    await expect(patternCraftButton(page, 'pattern-common-weapon')).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test('crafting with no resources logs an error instead of charging', async ({ page }) => {
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      unlocks: { minigames: true },
    });
    await gotoFreshGame(page);

    await patternCraftButton(page, 'pattern-common-weapon').click();

    await expect(page.locator('.log-entry', { hasText: 'Not enough' })).toBeVisible();
    await expect(patternCraftButton(page, 'pattern-common-weapon')).toBeEnabled(); // never started
  });

  test('starting a craft charges the cost immediately and disables every other pattern row', async ({ page }) => {
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);

    await patternCraftButton(page, 'pattern-common-weapon').click();

    // Weapon costs 5 Ironmongery + 5 Ingot; seeded with 20 of each.
    await expect(page.locator('.vault-row', { hasText: 'IRONMONGERY' }).locator('.vault-amount')).toHaveText('15');
    await expect(patternCraftButton(page, 'pattern-common-helmet')).toBeDisabled();
  });

  test('completing a craft grants the item to the Fighter and logs success', async ({ page }) => {
    test.setTimeout(60_000); // the assertion's 45s wait alone exceeds Playwright's default 30s test timeout
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);

    // Boots (40s) is the fastest-completing Common pattern — keeps this test's real wait
    // as short as the suite allows while still exercising a genuine completion.
    await patternCraftButton(page, 'pattern-common-boots').click();
    await expect(page.locator('.log-entry', { hasText: 'sturdy pair of boots' })).toBeVisible({ timeout: 45_000 });

    await expect(patternCraftButton(page, 'pattern-common-boots')).toHaveText('OWNED');
    await expect(patternCraftButton(page, 'pattern-common-boots')).toBeDisabled();
  });
});
