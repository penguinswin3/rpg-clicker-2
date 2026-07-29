import { Page, expect } from '@playwright/test';

/** Every reusable page interaction the e2e suite needs — one place to update if a
 *  selector/flow changes, instead of every spec re-deriving its own Dev Tools dance. */

export async function gotoFreshGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('button.primary-button');
}

export async function openDevTools(page: Page): Promise<void> {
  await page.click('text=Dev Tools');
  await expect(page.locator('.dev-tools-panel')).toBeVisible();
}

export async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

/** Grants 1,000,000 of every currency via Dev Tools — the fast path to affording
 *  anything (upgrades, the unlock-ranger objective) without grinding real clicks. */
export async function grantMillionOfEveryCurrency(page: Page): Promise<void> {
  await openDevTools(page);
  await page.click('button:has-text("+1M all")');
  await closeModal(page);
}

export async function unlockAllSystems(page: Page): Promise<void> {
  await openDevTools(page);
  await page.click('button:has-text("Unlock All Systems")');
  await closeModal(page);
}

/** Claims every currently-claimable Objectives row (loops since claiming one could in
 *  principle reveal another, though none do today). */
export async function claimAllReadyObjectives(page: Page): Promise<void> {
  await page.click('text=[ Objectives ]');
  while ((await page.locator('.objective-row.claimable').count()) > 0) {
    await page.locator('.objective-row.claimable').first().click();
  }
}

/** Grants a million gold and claims "unlock-ranger" — the fast path to a selectable
 *  Ranger (and, via the same objective, Better Offcuts/Extra Baiting/Clean Traps). */
export async function unlockRanger(page: Page): Promise<void> {
  await grantMillionOfEveryCurrency(page);
  await claimAllReadyObjectives(page);
}

/** Writes a save directly to localStorage *before* the app boots (via `addInitScript`,
 *  which runs ahead of any page script on every subsequent navigation in this context) —
 *  the same base64(JSON) shape `SaveService.exportBase64()` produces. Every field is
 *  optional from the reader's side (AGENTS.md's "Save" forward-compat rule, verified by
 *  `save.service.spec.ts`), so a test only needs to set the handful of fields its
 *  scenario actually cares about.
 *
 *  Prefer this over `unlockRanger`'s Dev-Tools currency grant whenever a test asserts an
 *  exact currency amount — granting a million of *every* resource (the only Dev Tools
 *  option) makes Bait/Raw Meat/Pelt deltas unobservable in the Party Vault's abbreviated
 *  display (`formatAmount` rounds to 3 significant digits, so 1,000,000 -> 1,000,001
 *  still just reads "1M"). */
export async function seedSave(page: Page, partialSave: Record<string, unknown>): Promise<void> {
  const base64 = Buffer.from(JSON.stringify(partialSave)).toString('base64');
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['rpg-clicker-2-save', base64] as [string, string]
  );
}

/** Ranger unlocked and active, plus its three upgrades (Better Offcuts/Extra
 *  Baiting/Clean Traps) unlocked — as if "unlock-ranger" had just been claimed — with an
 *  otherwise completely fresh, empty wallet. */
export async function seedRangerUnlockedSave(page: Page): Promise<void> {
  await seedSave(page, {
    characters: { unlockedIds: ['fighter', 'ranger'], activeId: 'ranger' },
    objectives: { reachedIds: [], completedIds: ['unlock-ranger'] },
    upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
  });
}

/** Blacksmith unlocked and active, with the Ranger unlock chain (and its 3 upgrades)
 *  already in place too, since "unlock-blacksmith" requires Ranger unlocked first — as
 *  if both objectives had just been claimed — with an otherwise completely fresh, empty
 *  wallet. */
export async function seedBlacksmithUnlockedSave(page: Page): Promise<void> {
  await seedSave(page, {
    characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
    objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
    upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
  });
}

export async function selectCharacter(page: Page, label: 'Fighter' | 'Ranger' | 'Blacksmith'): Promise<void> {
  await page.click(`.character-box:has-text("${label}")`);
  await expect(page.locator('.character-box.active')).toHaveText(label);
}

/** Locates a timed-action button by its stable `TimedActionConfig.id`
 *  (`data-testid="timed-action-<id>"`, button-zone.component.html) rather than its
 *  current label — a button's label is exactly what changes across its idle/running/ready
 *  phases (e.g. Bait Trap: "Bait Trap" -> "Waiting..." -> "Collect Prey"), so a
 *  text-based locator stops matching the moment the very state a test is asserting on
 *  changes the label. */
export function timedActionButton(page: Page, actionId: string) {
  return page.locator(`[data-testid="timed-action-${actionId}"]`);
}

/** Locates a crafting-action button by its stable `CraftingActionConfig.id`
 *  (`data-testid="crafting-action-<id>"`, button-zone.component.html), same reasoning as
 *  `timedActionButton` above. */
export function craftingActionButton(page: Page, actionId: string) {
  return page.locator(`[data-testid="crafting-action-${actionId}"]`);
}

/** Collects every console/page error seen during the callback's lifetime, for a final
 *  `expect(errors).toEqual([])` — the "does anything actually throw" half of a smoke test. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}
