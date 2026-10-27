import { test, expect, Page } from '@playwright/test';
import { gotoFreshGame, openResetSaveConfirm } from './helpers';

/**
 * Keyboard operation of the shared modal shell, end-to-end — the parts that are only
 * observable in a real browser running real change detection. See AGENTS.md §19: every
 * modal gets a focus trap, focus-moved-in-on-open, and focus-return-on-close from
 * `UiModalComponent`, so this is the one place that proves those actually hold for the
 * two flows that swap content inside an *already-open* modal (Options -> Credits and
 * Options -> Reset Save -> Confirm, neither of which closes and reopens the dialog).
 */

/** Where focus currently is, as something readable in a failure message. */
async function activeDescriptor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'BODY';
    return `${a.tagName.toLowerCase()}.${String(a.className).trim().split(/\s+/).join('.')}`;
  });
}

async function focusIsInsideModal(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const panel = document.querySelector('.modal-panel');
    return !!panel && panel.contains(document.activeElement) && document.activeElement !== document.body;
  });
}

async function openOptionsFromKeyboard(page: Page): Promise<void> {
  // Focus the real nav button and activate it with the keyboard — the whole point is that
  // the node that opens the modal is the node focus comes back to.
  await page.locator('.top-bar button', { hasText: 'Options' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.options-panel')).toBeVisible();
}

test.describe('Modal keyboard operation', () => {
  test('the top-bar nav buttons hold keyboard focus instead of being recreated out from under it', async ({
    page,
  }) => {
    await gotoFreshGame(page);
    await page.locator('.top-bar button', { hasText: 'Options' }).focus();

    // Longer than one playtime tick (the per-second markForCheck that used to recreate
    // every nav button's DOM node).
    await page.waitForTimeout(1500);

    expect(await activeDescriptor(page)).toBe('button.nav-btn');
  });

  for (const flow of [
    {
      label: 'Options -> Credits',
      advance: async (page: Page) => {
        await page.click('.options-panel button:has-text("Credits")');
        await expect(page.locator('app-credits-panel')).toBeVisible();
      },
    },
    {
      label: 'Options -> Reset Save Confirm',
      advance: async (page: Page) => {
        await page.click('.options-panel button:has-text("Reset Save")');
        await expect(page.locator('.confirm-modal')).toBeVisible();
      },
    },
  ] as const) {
    test(`${flow.label}: content swapping inside the open modal keeps focus in the dialog, and closing returns it to the trigger`, async ({
      page,
    }) => {
      await gotoFreshGame(page);
      await openOptionsFromKeyboard(page);
      expect(await focusIsInsideModal(page)).toBe(true);

      await flow.advance(page);

      // The element that was focused lived in the content that just got destroyed; without
      // UiModalComponent's content-change refocus this is BODY, and Tab walks out of a
      // dialog that's telling assistive tech aria-modal="true".
      expect(await activeDescriptor(page)).not.toBe('BODY');
      expect(await focusIsInsideModal(page)).toBe(true);

      // Still trapped: Tab repeatedly and focus never leaves the panel.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        expect(await focusIsInsideModal(page)).toBe(true);
      }

      await page.keyboard.press('Escape');
      await expect(page.locator('.modal-panel')).toHaveCount(0);

      // previouslyFocused is captured once, on open — so it's still the original top-bar
      // "Options" button, not the intermediate Credits/Reset Save trigger that's long gone.
      expect(await activeDescriptor(page)).toBe('button.nav-btn');
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Options');
    });
  }

  test('a Tab that happens while focus has escaped the open modal is pulled back in', async ({ page }) => {
    await gotoFreshGame(page);
    await openResetSaveConfirm(page);

    // Simulates every way focus can end up outside an open modal (content swapped from
    // under the focused node, focus-return to a since-removed trigger, a stray blur).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await activeDescriptor(page)).toBe('BODY');

    await page.keyboard.press('Tab');

    expect(await focusIsInsideModal(page)).toBe(true);
  });
});
