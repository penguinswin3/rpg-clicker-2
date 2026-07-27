import { test, expect } from '@playwright/test';
import { gotoFreshGame, unlockAllSystems, timedActionButton, trackConsoleErrors } from './helpers';

test.describe('Fighter', () => {
  test('Hard Labor grants gold on click', async ({ page }) => {
    await gotoFreshGame(page);
    const goldRow = page.locator('.vault-row', { hasText: 'GOLD' });

    await page.click('button.primary-button');

    // Gold isn't in the Party Vault at all until its amount first goes above 0.
    await expect(goldRow).toBeVisible();
    await expect(goldRow.locator('.vault-amount')).toHaveText('1');
  });

  test('Guild Contract: fixed 10s duration, shows a progress fill, disables while running, then auto pays out', async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await gotoFreshGame(page);
    await unlockAllSystems(page);

    const contract = timedActionButton(page, 'fighter-guild-contract');
    await expect(contract).toBeVisible();
    await expect(contract).toBeEnabled();

    await contract.click();
    await expect(contract).toBeDisabled();
    await expect(page.locator('.timed-button-fill')).toHaveCount(1);

    // Guild Contract's duration is a known, fixed 10s (game-config.ts) — generous margin
    // over that for CI slowness, but this isn't a hidden/random duration like Bait Trap.
    await expect(contract).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('.log-entry', { hasText: 'Guild contract' })).toBeVisible();

    const goldRow = page.locator('.vault-row', { hasText: 'GOLD' });
    await expect(goldRow.locator('.vault-amount')).toHaveText('15');

    expect(errors).toEqual([]);
  });
});
