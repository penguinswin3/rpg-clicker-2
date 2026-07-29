import { test, expect } from '@playwright/test';
import {
  gotoFreshGame,
  unlockAllSystems,
  seedRangerUnlockedSave,
  seedBlacksmithUnlockedSave,
  timedActionButton,
  craftingActionButton,
} from './helpers';

test.describe('Tooltips', () => {
  test('the primary button shows nothing immediately, then a Yield row after a short hover delay', async ({ page }) => {
    await gotoFreshGame(page);
    const button = page.locator('button.primary-button');

    await button.hover();
    // Deliberately not shown right away — TooltipDirective's whole point is to not
    // flash a tooltip on every incidental pointer pass over a button.
    await expect(page.locator('.tooltip-box')).toHaveCount(0);

    await expect(page.locator('.tooltip-box')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('.tooltip-box')).toContainText('Yield');
    await expect(page.locator('.tooltip-box')).toContainText('Hard Labor'); // title
  });

  test('moving the pointer away hides the tooltip', async ({ page }) => {
    await gotoFreshGame(page);
    const button = page.locator('button.primary-button');

    await button.hover();
    await expect(page.locator('.tooltip-box')).toBeVisible({ timeout: 1000 });

    await page.mouse.move(5, 5); // well away from the button
    await expect(page.locator('.tooltip-box')).toHaveCount(0);
  });

  test('pressing the button hides the tooltip immediately rather than leaving it up mid-hold', async ({ page }) => {
    await gotoFreshGame(page);
    const button = page.locator('button.primary-button');

    await button.hover();
    await expect(page.locator('.tooltip-box')).toBeVisible({ timeout: 1000 });

    await page.mouse.down();
    await expect(page.locator('.tooltip-box')).toHaveCount(0);
    await page.mouse.up();
  });

  test('a timed action tooltip (Guild Contract) shows Duration and Yield', async ({ page }) => {
    await gotoFreshGame(page);
    await unlockAllSystems(page);

    const contract = timedActionButton(page, 'fighter-guild-contract');
    await contract.hover();

    const tooltip = page.locator('.tooltip-box');
    await expect(tooltip).toBeVisible({ timeout: 1000 });
    await expect(tooltip).toContainText('Duration');
    await expect(tooltip).toContainText('10s');
    await expect(tooltip).toContainText('Yield');
    await expect(tooltip).toContainText('15');
  });

  test('a timed action with a cost and random duration (Bait Trap) shows a Cost row and a duration range', async ({
    page,
  }) => {
    await seedRangerUnlockedSave(page);
    await gotoFreshGame(page);

    const trap = timedActionButton(page, 'ranger-bait-trap');
    await trap.hover();

    const tooltip = page.locator('.tooltip-box');
    await expect(tooltip).toBeVisible({ timeout: 1000 });
    await expect(tooltip).toContainText('Cost');
    await expect(tooltip).toContainText('Duration');
    await expect(tooltip).toContainText('-'); // a min-max range, not a single value
    await expect(tooltip).toContainText('Collection');
  });

  test('a crafting tooltip (Forge Ingots) shows Cost, Yield, and Hold Time', async ({ page }) => {
    await seedBlacksmithUnlockedSave(page);
    await gotoFreshGame(page);

    const forge = craftingActionButton(page, 'blacksmith-forge-ingots');
    await forge.hover();

    const tooltip = page.locator('.tooltip-box');
    await expect(tooltip).toBeVisible({ timeout: 1000 });
    await expect(tooltip).toContainText('Cost');
    await expect(tooltip).toContainText('Yield');
    await expect(tooltip).toContainText('Hold Time');
    await expect(tooltip).toContainText('10s');
  });

  test('a crafting tooltip (Smith Metal) shows Clicks Required instead of Hold Time', async ({ page }) => {
    await seedBlacksmithUnlockedSave(page);
    await gotoFreshGame(page);

    const smith = craftingActionButton(page, 'blacksmith-smith-metal');
    await smith.hover();

    const tooltip = page.locator('.tooltip-box');
    await expect(tooltip).toBeVisible({ timeout: 1000 });
    await expect(tooltip).toContainText('Clicks Required');
    await expect(tooltip).not.toContainText('Hold Time');
  });

  test('the tooltip stays fully within the viewport (no negative/off-screen position)', async ({ page }) => {
    await gotoFreshGame(page);
    const button = page.locator('button.primary-button');

    await button.hover();
    const tooltip = page.locator('.tooltip-box');
    await expect(tooltip).toBeVisible({ timeout: 1000 });

    const box = await tooltip.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });
});
