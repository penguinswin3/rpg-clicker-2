import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { HoldToClickDirective } from '../../shared/hold-to-click.directive';
import { resourceAmountToken } from '../../shared/resource-token';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { WalletService } from '../../economy/wallet.service';
import { ActivityLogService } from '../../activity-log/activity-log.service';
import { UnlocksService } from '../../shared/unlocks.service';
import { HoldHintService } from '../../shared/hold-hint.service';
import { resolveExcessCount } from '../../shared/chance';
import { TimedActionsService, TimedActionState } from '../../timed-actions/timed-actions.service';
import { CraftingService, CraftingActionState } from '../../crafting/crafting.service';
import {
  CHARACTER_ACTIONS,
  CharacterActionConfig,
  AUTOCLICK_INTERVAL_MS,
  TIMED_ACTION_TICK_MS,
} from '../../configs/game-config';
import { getActionFlavor, getTimedActionFlavor, getCraftingFlavor } from '../../configs/flavor-text';
import { StatisticsService } from '../../statistics/statistics.service';
import { UpgradesService } from '../../upgrades/upgrades.service';

/** Cosmetic-only pacing for a hidden-duration timed action's "still working" dot pulse
 *  (see `timedActionLabel`/`waitingDots`) — not a game value, so it lives here rather
 *  than game-config.ts. */
const MAX_WAITING_DOTS = 3;
const WAITING_DOT_INTERVAL_MS = 700;

/** %zone-button's own horizontal padding (2 * 32px) + border (2 * 1px) —
 *  button-zone.component.scss. `timedActionMinWidthPx` needs this literally: buttons are
 *  `box-sizing: border-box`, so a `min-width` sized purely off character count (`ch`) has
 *  no effect until it's large enough to also cover this chrome, not just the text. Keep
 *  in sync if %zone-button's padding/border ever changes. */
const BUTTON_HORIZONTAL_CHROME_PX = 66;

/** %zone-button's own font-size/letter-spacing — button-zone.component.scss. A `ch` unit
 *  only measures one glyph, not the letter-spacing gap after it, so `timedActionMinWidthPx`
 *  underestimates a long label's real width by roughly this much per character without
 *  the correction below. Keep in sync if %zone-button's font-size/letter-spacing change. */
const BUTTON_FONT_SIZE_PX = 16;
const BUTTON_LETTER_SPACING_EM = 0.05;

/** Top half of the game screen — hosts the primary clicker button(s) plus any unlocked
 *  timed-action ("second") buttons, one set per character. Only Fighter has an action
 *  configured so far; everyone else sees the empty state (see CHARACTER_ACTIONS /
 *  TIMED_ACTIONS in game-config.ts). */
@Component({
  selector: 'app-button-zone',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, HoldToClickDirective],
  templateUrl: './button-zone.component.html',
  styleUrl: './button-zone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonZoneComponent implements OnInit, OnDestroy {
  private characterService = inject(CharacterSelectService);
  private wallet = inject(WalletService);
  private activityLog = inject(ActivityLogService);
  private statistics = inject(StatisticsService);
  private upgrades = inject(UpgradesService);
  private unlocks = inject(UnlocksService);
  private timedActions = inject(TimedActionsService);
  private crafting = inject(CraftingService);
  private holdHint = inject(HoldHintService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly autoClickIntervalMs = AUTOCLICK_INTERVAL_MS;
  activeCharacterId = this.characterService.active;

  /** Once the player has actually held down any hold-to-click button (not just tapped
   *  it), the "hold to repeat" hint has done its job everywhere — checked across all
   *  action ids, not just the active character's, so switching characters doesn't bring
   *  the hint back. Persisted via `HoldHintService` so it stays gone across a reload,
   *  not just for the session. */
  get hasHeld(): boolean {
    return this.holdHint.hasHeldAny();
  }

  get action(): CharacterActionConfig | undefined {
    return CHARACTER_ACTIONS.find(a => a.characterId === this.activeCharacterId);
  }

  get actionLabel(): string {
    const action = this.action;
    return action ? getActionFlavor(action.id).label : '';
  }

  get timedActionsForActiveCharacter(): TimedActionState[] {
    return this.timedActions.actions.filter(
      a => a.config.characterId === this.activeCharacterId && a.unlocked
    );
  }

  get craftingActionsForActiveCharacter(): CraftingActionState[] {
    return this.crafting.actions.filter(c => c.config.characterId === this.activeCharacterId);
  }

  get holdCraftingActions(): CraftingActionState[] {
    return this.craftingActionsForActiveCharacter.filter(c => c.config.mechanic.type === 'hold');
  }

  get clickCraftingActions(): CraftingActionState[] {
    return this.craftingActionsForActiveCharacter.filter(c => c.config.mechanic.type === 'clicks');
  }

  get hasAnyButtons(): boolean {
    return (
      !!this.action ||
      this.timedActionsForActiveCharacter.length > 0 ||
      this.craftingActionsForActiveCharacter.length > 0
    );
  }

  /** `timedActionsForActiveCharacter` returns a fresh array of fresh `TimedActionState`
   *  objects on every read (see `TimedActionsService.actions`) — without a `trackBy`,
   *  Angular's default identity-based diffing would see a "new" object every change
   *  detection cycle and destroy/recreate each button's DOM node instead of reusing it,
   *  including on the periodic TIMED_ACTION_TICK_MS refresh while one is running. That
   *  churn is at best wasted work and at worst a visible flicker / a brief moment where
   *  the element doesn't exist (caught by e2e: Playwright's boundingBox() intermittently
   *  saw a detached node mid-cycle). Track by the one thing that's actually stable across
   *  every phase of a given action: its config id. */
  trackTimedAction(_: number, t: TimedActionState): string {
    return t.config.id;
  }

  trackCraftingAction(_: number, c: CraftingActionState): string {
    return c.config.id;
  }

  ngOnInit(): void {
    this.sub.add(this.characterService.active$.subscribe(id => {
      this.activeCharacterId = id;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.timedActions.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.crafting.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.unlocks.state$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.holdHint.changes$.subscribe(() => this.cdr.markForCheck()));
    // Re-renders the progress fill on the same cadence TimedActionsService/CraftingService
    // check completion on (TIMED_ACTION_TICK_MS) — purely visual, the running/complete
    // state itself never depends on this timer, this just keeps the bar from looking
    // stale between ticks. A 'hold' crafting action's progress is a live computation
    // (CraftingService.progressFor), not something that emits `changes$` on every tick,
    // so it needs the same nudge a running timed action does.
    this.sub.add(interval(TIMED_ACTION_TICK_MS).subscribe(() => {
      const timedRunning = this.timedActionsForActiveCharacter.some(a => a.running);
      const holdCrafting = this.holdCraftingActions.some(c => c.progress > 0 && c.progress < 1);
      if (timedRunning || holdCrafting) this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onAction(): void {
    const action = this.action;
    if (!action) return;

    const baseAmount = action.amountPerAction + this.upgrades.getActionAmountBonus(action.id);
    const doubled = Math.random() < this.upgrades.getPayoutDoubleChance(action.id);
    // Better Offcuts' cascading chance (uncapped at 100%, unlike the simple double-chance
    // above) — resolveExcessCount turns it into an actual doubling count.
    const cascadeDoubles = resolveExcessCount(this.upgrades.getCascadingDoubleChance(action.id));
    const amount = (doubled ? baseAmount * 2 : baseAmount) * Math.pow(2, cascadeDoubles);
    this.wallet.add(action.resourceId, amount);
    this.statistics.recordAction(action.id);
    this.logAction(action, amount, doubled || cascadeDoubles > 0);
  }

  /** Click handler for a timed-action button in every phase: idle starts it, ready
   *  collects it, running is a no-op (the button is disabled anyway). */
  onTimedAction(t: TimedActionState): void {
    if (t.ready) this.timedActions.collect(t.config.id);
    else if (!t.running) this.timedActions.start(t.config.id);
  }

  onHoldRepeat(): void {
    if (this.action) this.holdHint.markHeld(this.action.id);
  }

  craftingLabel(c: CraftingActionState): string {
    return getCraftingFlavor(c.config.id).label;
  }

  onCraftHoldStart(c: CraftingActionState): void {
    this.crafting.startHold(c.config.id);
  }

  onCraftHoldEnd(c: CraftingActionState): void {
    this.crafting.releaseHold(c.config.id);
  }

  onCraftClick(c: CraftingActionState): void {
    this.crafting.click(c.config.id);
  }

  /** `min-width` (as a CSS `calc()` string) sized for the widest label this action can
   *  ever show — reserves 3 trailing dots on `runningLabel` even though only 1 is
   *  showing most of the time — plus `BUTTON_HORIZONTAL_CHROME_PX` for the button's own
   *  padding/border (needed since the button is `box-sizing: border-box`, so a bare
   *  `ch` floor would have no effect until it also covered that chrome, not just the
   *  text). Keeps "Bait Trap" / "Waiting..." / "Collect Prey" from ever resizing the
   *  button as its label changes. */
  timedActionMinWidthPx(t: TimedActionState): string {
    const flavor = getTimedActionFlavor(t.config.id);
    const runningWidth = flavor.runningLabel ? flavor.runningLabel.length + MAX_WAITING_DOTS : flavor.label.length;
    const chars = Math.max(flavor.label.length, runningWidth, (flavor.readyLabel ?? flavor.label).length);
    const letterSpacingPx = BUTTON_FONT_SIZE_PX * BUTTON_LETTER_SPACING_EM * Math.max(chars - 1, 0);
    return `calc(${chars}ch + ${BUTTON_HORIZONTAL_CHROME_PX + letterSpacingPx}px)`;
  }

  timedActionLabel(t: TimedActionState): string {
    const flavor = getTimedActionFlavor(t.config.id);
    if (t.ready) return flavor.readyLabel ?? flavor.label;
    if (t.running) {
      const base = flavor.runningLabel ?? flavor.label;
      // A 'random' duration is deliberately hidden from the player (see
      // TimedActionConfig.duration) — no progress fill for it (§ template), so this
      // cycles 1-3 trailing dots as a "still working" pulse instead of a real readout.
      // Padded with non-breaking spaces to MAX_WAITING_DOTS so the dot count changing
      // never itself shifts the label's width within the button.
      return t.config.duration.type === 'random' ? base + this.waitingDots() : base;
    }
    return flavor.label;
  }

  /** Cycles 1 -> 2 -> 3 -> 1 dot(s), padded to a constant MAX_WAITING_DOTS length with
   *  non-breaking spaces. Paced off wall-clock time (WAITING_DOT_INTERVAL_MS per step) so
   *  it stays in sync across re-renders without its own timer/state. */
  private waitingDots(): string {
    const count = (Math.floor(Date.now() / WAITING_DOT_INTERVAL_MS) % MAX_WAITING_DOTS) + 1;
    return '.'.repeat(count) + ' '.repeat(MAX_WAITING_DOTS - count);
  }

  private logAction(action: CharacterActionConfig, amount: number, doubled: boolean): void {
    const { logMessage } = getActionFlavor(action.id);
    const gainToken = resourceAmountToken(action.resourceId, amount);
    // A doubled payout (Bonus Payout / Better Offcuts) is a noteworthy lucky break, not
    // routine play — 'success' instead of 'default', same convention TimedActionsService
    // follows.
    this.activityLog.log(`${logMessage} (${gainToken})`, doubled ? 'success' : 'default');
  }
}
