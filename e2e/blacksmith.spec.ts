import { test, expect } from '@playwright/test';
import {
  gotoFreshGame,
  seedSave,
  seedBlacksmithUnlockedSave,
  selectCharacter,
  craftingActionButton,
  claimAllReadyObjectives,
  trackConsoleErrors,
} from './helpers';

test.describe('Blacksmith', () => {
  test('the unlock-blacksmith objective actually unlocks the character, gated behind collecting prey (ranger-bait-trap)', async ({
    page,
  }) => {
    // Ranger already unlocked, and the "collect prey" target already satisfied via
    // StatisticsService's action count for ranger-bait-trap specifically — seeding this
    // directly avoids grinding real (5-20s each) Bait Trap collections in e2e.
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger'], activeId: 'ranger' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      statistics: { actionCounts: { 'ranger-bait-trap': 25 }, lifetimeGained: {}, majorUnlocks: [] },
    });
    await gotoFreshGame(page);

    expect(await page.locator('.character-box', { hasText: 'Blacksmith' }).count()).toBe(0);

    await page.click('text=[ Objectives ]');
    const row = page.locator('.objective-row', { hasText: 'Collect Prey' });
    await expect(row).toHaveClass(/claimable/);
    await row.click();

    await expect(page.locator('.character-box', { hasText: 'Blacksmith' })).toBeVisible();
    await selectCharacter(page, 'Blacksmith');

    const oreRow = page.locator('.vault-row', { hasText: 'ORE' });
    await page.click('button.primary-button');
    await expect(oreRow.locator('.vault-amount')).toHaveText('1');
  });

  test('Mine Ore grants exactly 1 Ore per click', async ({ page }) => {
    await seedBlacksmithUnlockedSave(page);
    await gotoFreshGame(page);

    await page.click('button.primary-button');
    await expect(page.locator('.vault-row', { hasText: 'ORE' }).locator('.vault-amount')).toHaveText('1');
  });

  test('Forge Ingots with no Ore in the wallet logs an error instead of charging', async ({ page }) => {
    await seedBlacksmithUnlockedSave(page);
    await gotoFreshGame(page);

    const forge = craftingActionButton(page, 'blacksmith-forge-ingots');
    const box = (await forge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();

    await expect(page.locator('.log-entry', { hasText: 'Not enough' })).toBeVisible();
    await expect(page.locator('.vault-row', { hasText: 'INGOT' })).toHaveCount(0);
  });

  test('Forge Ingots: holding charges progress, releasing early decays it back down without paying out', async ({
    page,
  }) => {
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      wallet: { amounts: { ore: 10 }, unlockedIds: ['ore'] },
    });
    await gotoFreshGame(page);

    const forge = craftingActionButton(page, 'blacksmith-forge-ingots');
    const box = (await forge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2_000); // charge partway through the 10s hold
    await page.mouse.up();

    // Ore was charged on the initial press (cost is paid up front), but releasing well
    // short of the full 10s must not have paid out an ingot yet.
    await expect(page.locator('.vault-row', { hasText: 'ORE' }).locator('.vault-amount')).toHaveText('0');
    await expect(page.locator('.vault-row', { hasText: 'INGOT' })).toHaveCount(0);

    // Decay drains 3x the charge rate — well clear of the ~10s it'd take to complete.
    await page.waitForTimeout(3_000);
    await expect(page.locator('.vault-row', { hasText: 'INGOT' })).toHaveCount(0);
  });

  test('Forge Ingots: holding for the full 10s pays out 1 Ingot', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      wallet: { amounts: { ore: 10 }, unlockedIds: ['ore'] },
    });
    await gotoFreshGame(page);

    const forge = craftingActionButton(page, 'blacksmith-forge-ingots');
    const box = (await forge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(10_500); // full 10s hold, generous margin for CI slowness
    await page.mouse.up();

    await expect(page.locator('.vault-row', { hasText: 'INGOT' }).locator('.vault-amount')).toHaveText('1');
    // hasText: 'ingot' would also match the "Forge Ingots" label itself (e.g. the
    // auto-chain's own insufficient-cost error below) — match the completion flavor
    // sentence specifically instead.
    await expect(page.locator('.log-entry', { hasText: 'fresh ingot' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Forge Ingots: still holding when one attempt completes auto-chains into the next', async ({ page }) => {
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      wallet: { amounts: { ore: 20 }, unlockedIds: ['ore'] }, // enough ore for two attempts
    });
    await gotoFreshGame(page);

    const forge = craftingActionButton(page, 'blacksmith-forge-ingots');
    const box = (await forge.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // One continuous hold across both 10s attempts — never releasing in between.
    await page.waitForTimeout(21_000);
    await page.mouse.up();

    await expect(page.locator('.vault-row', { hasText: 'INGOT' }).locator('.vault-amount')).toHaveText('2');
    await expect(page.locator('.vault-row', { hasText: 'ORE' }).locator('.vault-amount')).toHaveText('0');
  });

  test('Smith Metal with no Ingots in the wallet logs an error instead of charging', async ({ page }) => {
    await seedBlacksmithUnlockedSave(page);
    await gotoFreshGame(page);

    await craftingActionButton(page, 'blacksmith-smith-metal').click();

    await expect(page.locator('.log-entry', { hasText: 'Not enough' })).toBeVisible();
    await expect(page.locator('.vault-row', { hasText: 'IRONMONGERY' })).toHaveCount(0);
  });

  test('Smith Metal: 10 clicks pays out 1 Ironmongery', async ({ page }) => {
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      wallet: { amounts: { ingot: 10 }, unlockedIds: ['ingot'] },
    });
    await gotoFreshGame(page);

    const smith = craftingActionButton(page, 'blacksmith-smith-metal');
    await expect(page.locator('.vault-row', { hasText: 'INGOT' }).locator('.vault-amount')).toHaveText('10');

    for (let i = 0; i < 9; i++) await smith.click();
    // First click already charged the cost; still not complete before the 10th click.
    await expect(page.locator('.vault-row', { hasText: 'INGOT' }).locator('.vault-amount')).toHaveText('0');
    await expect(page.locator('.vault-row', { hasText: 'IRONMONGERY' })).toHaveCount(0);

    await smith.click();
    await expect(page.locator('.vault-row', { hasText: 'IRONMONGERY' }).locator('.vault-amount')).toHaveText('1');
  });

  test('craft-10-ironmongery objective unlocks the Minigames zone', async ({ page }) => {
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      statistics: { actionCounts: {}, lifetimeGained: { ironmongery: 10 }, majorUnlocks: [] },
    });
    await gotoFreshGame(page);

    await expect(page.locator('.minigame-zone')).toHaveCount(0);

    await claimAllReadyObjectives(page);

    await expect(page.locator('.minigame-zone')).toBeVisible();
  });
});
