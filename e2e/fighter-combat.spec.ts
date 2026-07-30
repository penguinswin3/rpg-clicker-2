// e2e/fighter-combat.spec.ts
import { test, expect } from '@playwright/test';
import { gotoFreshGame, seedSave, trackConsoleErrors } from './helpers';

test.describe('Fighter Combat minigame', () => {
  test('shows all seven zones once minigames are unlocked and Fighter is active', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);

    await expect(page.locator('app-fighter-combat')).toBeVisible();
    await expect(page.locator('app-inventory-panel')).toBeVisible();
    await expect(page.locator('app-equipment-panel')).toBeVisible();
    await expect(page.locator('button.fight-button')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Fight! starts an encounter against the Kobold', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);

    await page.click('button.fight-button');

    await expect(page.locator('button.flee-button')).toBeVisible();
    await expect(page.locator('app-combat-feed')).toBeVisible();
  });

  test('winning grants gold and logs the victory', async ({ page }) => {
    await seedSave(page, {
      unlocks: { minigames: true },
      combat: {
        fighterHp: 140,
        lockedOutUntil: null,
        activeEncounter: { areaId: 'kobold-den', enemyId: 'kobold', enemyHp: 1, actorTurn: 'fighter', turns: [] },
      },
    });
    await gotoFreshGame(page);

    await expect(page.locator('.log-entry', { hasText: 'defeat a Kobold' })).toBeVisible({ timeout: 20_000 });

    const goldRow = page.locator('.vault-row', { hasText: 'GOLD' });
    await expect(goldRow.locator('.vault-amount')).not.toHaveText('0');
    await expect(page.locator('button.fight-button')).toBeEnabled();
  });

  test('losing revives the Fighter and shows the recovery lockout', async ({ page }) => {
    await seedSave(page, {
      unlocks: { minigames: true },
      combat: {
        fighterHp: 1,
        lockedOutUntil: null,
        activeEncounter: { areaId: 'kobold-den', enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy', turns: [] },
      },
    });
    await gotoFreshGame(page);

    await expect(page.locator('.log-entry', { hasText: 'defeated by a Kobold' })).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('button.fight-button', { hasText: 'Recovering' })).toBeVisible();
  });

  test('fleeing ends the encounter immediately with no loot and no lockout', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);

    await page.click('button.fight-button');
    await page.click('button.flee-button');

    await expect(page.locator('button.fight-button')).toBeEnabled();
    await expect(page.locator('button.fight-button')).not.toHaveText(/Recovering/);
  });
});
