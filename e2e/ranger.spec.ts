import { test, expect } from '@playwright/test';
import {
  gotoFreshGame,
  unlockRanger,
  seedRangerUnlockedSave,
  selectCharacter,
  timedActionButton,
  trackConsoleErrors,
} from './helpers';

test.describe('Ranger', () => {
  test('the unlock-ranger objective actually unlocks the character and its 3 upgrades', async ({ page }) => {
    await gotoFreshGame(page);
    await unlockRanger(page);

    await expect(page.locator('.character-box', { hasText: 'Ranger' })).toBeVisible();
    await selectCharacter(page, 'Ranger');

    await page.click('text=[ Upgrades ]');
    const upgradesText = await page.locator('.upgrades-panel').innerText();
    expect(upgradesText).toContain('Better Offcuts');
    expect(upgradesText).toContain('Extra Baiting');
    expect(upgradesText).toContain('Clean Traps');
    // Fighter's upgrades must NOT leak in while Ranger is the active character.
    expect(upgradesText).not.toContain('Hard Work');
  });

  test.describe('with Ranger already unlocked and an empty wallet', () => {
    test.beforeEach(async ({ page }) => {
      await seedRangerUnlockedSave(page);
      await gotoFreshGame(page);
    });

    test('Cut Bait grants exactly 1 Bait per click', async ({ page }) => {
      await page.click('button.primary-button');
      await expect(page.locator('.vault-row', { hasText: 'BAIT' }).locator('.vault-amount')).toHaveText('1');
    });

    test('Bait Trap with no Bait in the wallet logs an error instead of starting', async ({ page }) => {
      const trap = timedActionButton(page, 'ranger-bait-trap');
      await trap.click();

      await expect(trap).toBeEnabled(); // never started — button stays in its idle state
      await expect(page.locator('.log-entry', { hasText: 'Not enough' })).toBeVisible();
    });

    test('Bait Trap costs exactly 1 Bait to start, disables while waiting, and shows no progress fill', async ({
      page,
    }) => {
      for (let i = 0; i < 3; i++) await page.click('button.primary-button'); // 3 Bait
      await expect(page.locator('.vault-row', { hasText: 'BAIT' }).locator('.vault-amount')).toHaveText('3');

      const trap = timedActionButton(page, 'ranger-bait-trap');
      await trap.click();

      await expect(trap).toBeDisabled();
      await expect(page.locator('.timed-button-fill')).toHaveCount(0); // hidden duration, no readout
      await expect(page.locator('.vault-row', { hasText: 'BAIT' }).locator('.vault-amount')).toHaveText('2');
    });

    test('Bait Trap label cycles 1-3 dots while waiting without ever resizing the button', async ({ page }) => {
      await page.click('button.primary-button');
      const trap = timedActionButton(page, 'ranger-bait-trap');
      await trap.click();

      const widths = new Set<number>();
      const labels = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const box = await trap.boundingBox();
        widths.add(Math.round(box!.width));
        labels.add((await trap.locator('.timed-button-label').innerText()).trim());
        await page.waitForTimeout(400);
      }

      expect(widths.size).toBe(1); // never resized, however many dots are showing
      expect(labels.size).toBeGreaterThan(1); // the dot count did actually change
      for (const label of labels) expect(label.startsWith('Waiting')).toBe(true);
    });

    test('Bait Trap becomes ready in plain (non-gold) styling, then pays out Raw Meat on collect', async ({
      page,
    }) => {
      const errors = trackConsoleErrors(page);
      await page.click('button.primary-button');
      const trap = timedActionButton(page, 'ranger-bait-trap');
      await trap.click();

      // Random 5-20s duration (game-config.ts) — poll rather than a fixed wait.
      await expect(trap).toHaveText('Collect Prey', { timeout: 25_000 });
      await expect(trap).toBeEnabled();
      // %zone-button transitions `color` over 0.1s (button-zone.component.scss) as the
      // disabled/running -> enabled/ready styling flips — give it a moment to settle so
      // this doesn't intermittently read a mid-transition interpolated shade.
      await page.waitForTimeout(150);

      const color = await trap.evaluate(el => getComputedStyle(el).color);
      expect(color).toBe('rgb(255, 255, 255)'); // plain white, not the gold claimable-reward color

      await expect(page.locator('.vault-row', { hasText: 'RAW MEAT' })).toHaveCount(0); // not unlocked yet

      await trap.click();

      await expect(page.locator('.vault-row', { hasText: 'RAW MEAT' }).locator('.vault-amount')).toHaveText('1');
      await expect(trap).toHaveText('Bait Trap'); // back to idle, ready to start again
      await expect(page.locator('.log-entry', { hasText: 'trap' })).toBeVisible();

      expect(errors).toEqual([]);
    });
  });
});
