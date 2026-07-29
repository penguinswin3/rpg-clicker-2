import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { StatisticsService } from '../statistics/statistics.service';
import { CRAFTING_ACTIONS, CraftingActionConfig, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getCraftingFlavor } from '../configs/flavor-text';
import { resourceAmountToken, resourceNameToken } from '../shared/resource-token';

export interface CraftingActionState {
  config: CraftingActionConfig;
  /** 0..1 fraction toward completion — computed live for a 'hold' action (see
   *  HoldInstance below), a plain step ratio (clicksDone / clicksRequired) for 'clicks'. */
  progress: number;
}

type HoldMechanic = Extract<CraftingActionConfig['mechanic'], { type: 'hold' }>;

/** `anchorProgressMs`/`anchorAt` — progress is a pure function of elapsed real time
 *  since the anchor plus the current charge/decay direction (`holding`), recomputed live
 *  on every read (`holdProgressMs`) rather than mutated on a tick — the same "absolute
 *  anchor, compute forward from Date.now()" convention TimedActionsService uses for its
 *  own start timestamps. Only the anchor itself needs updating, and only at the moments
 *  `holding` actually flips (see startHold/releaseHold) — nothing needs to run every
 *  tick just to keep this number "live." */
interface HoldInstance {
  anchorProgressMs: number;
  anchorAt: number;
  holding: boolean;
}

export interface CraftingSnapshot {
  /** `savedAt` lets `restore` apply whatever decay would have happened while the save
   *  was closed, rather than pretending no time passed — same real-elapsed-time
   *  convention as TimedActionsSnapshot. */
  holds: Record<string, { progressMs: number; savedAt: number }>;
  clicks: Record<string, number>;
}

/**
 * Blacksmith's crafting buttons — Forge Ingots (hold to charge, decays fast on release)
 * and Smith Metal (click N times) — both interactive multi-step actions that need
 * sustained player engagement to complete, unlike CHARACTER_ACTIONS (instant) or
 * TIMED_ACTIONS (passive real-time wait that runs unattended regardless of screen). See
 * CraftingActionConfig (game-config.ts) for the discriminated 'hold'/'clicks' mechanic
 * shape. Cost is charged once, the moment progress first leaves 0, not per click/tick;
 * the reward pays out only once progress reaches its target.
 */
@Injectable({ providedIn: 'root' })
export class CraftingService {
  private wallet = inject(WalletService);
  private activityLog = inject(ActivityLogService);
  private statistics = inject(StatisticsService);

  private holdInstances = new Map<string, HoldInstance>();
  private clickCounts = new Map<string, number>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    // Only needs to run often enough to catch a 'hold' action crossing either end (full
    // charge or fully decayed) promptly — reuses TIMED_ACTION_TICK_MS rather than
    // inventing a second near-identical constant, same reasoning as that constant's own
    // doc comment (game-config.ts).
    setInterval(() => this.checkHoldCompletions(), TIMED_ACTION_TICK_MS);
  }

  get actions(): CraftingActionState[] {
    return CRAFTING_ACTIONS.map(config => ({ config, progress: this.progressFor(config) }));
  }

  progressFor(config: CraftingActionConfig): number {
    if (config.mechanic.type === 'clicks') {
      return (this.clickCounts.get(config.id) ?? 0) / config.mechanic.clicksRequired;
    }
    const instance = this.holdInstances.get(config.id);
    return instance ? this.holdProgressMs(instance, config.mechanic) / config.mechanic.holdMs : 0;
  }

  /** Pointer-down on a 'hold' action's button — charges the cost on a fresh attempt (no
   *  existing progress) and starts charging; resuming a partially-decayed attempt just
   *  flips the direction, it doesn't re-charge. No-ops (logging an insufficient-cost
   *  error) if unaffordable on a fresh attempt; no-ops silently for an unknown id or one
   *  that isn't 'hold'. */
  startHold(id: string): void {
    const config = CRAFTING_ACTIONS.find(a => a.id === id);
    if (!config || config.mechanic.type !== 'hold') return;

    const existing = this.holdInstances.get(id);
    if (!existing) {
      if (this.beginFreshHold(config)) this.changesSource.next();
    } else if (!existing.holding) {
      const progressMs = this.holdProgressMs(existing, config.mechanic);
      this.holdInstances.set(id, { anchorProgressMs: progressMs, anchorAt: Date.now(), holding: true });
      this.changesSource.next();
    }
  }

  /** Charges cost and starts a brand-new 'hold' attempt at 0 progress, if affordable —
   *  shared by a fresh press (`startHold`) and by auto-chaining straight into the next
   *  attempt when the player is still holding the button the instant one completes
   *  (`checkHoldCompletions`). Logs the insufficient-cost error and returns false
   *  (nothing changed, caller shouldn't emit) if unaffordable. */
  private beginFreshHold(config: CraftingActionConfig): boolean {
    if (config.mechanic.type !== 'hold') return false;
    if (this.wallet.getAmount(config.cost.resourceId) < config.cost.amount) {
      this.logInsufficientCost(config);
      return false;
    }
    this.wallet.add(config.cost.resourceId, -config.cost.amount);
    this.holdInstances.set(config.id, { anchorProgressMs: 0, anchorAt: Date.now(), holding: true });
    return true;
  }

  /** Pointer-up/leave/cancel — flips to decaying from whatever progress was actually
   *  reached at this exact moment, not the last-known anchor. No-op if nothing is in
   *  progress or it's already decaying. */
  releaseHold(id: string): void {
    const config = CRAFTING_ACTIONS.find(a => a.id === id);
    if (!config || config.mechanic.type !== 'hold') return;
    const existing = this.holdInstances.get(id);
    if (!existing || !existing.holding) return;

    const progressMs = this.holdProgressMs(existing, config.mechanic);
    this.holdInstances.set(id, { anchorProgressMs: progressMs, anchorAt: Date.now(), holding: false });
    this.changesSource.next();
  }

  /** Click for a 'clicks' action's button — charges the cost on the first click of a
   *  fresh attempt, then advances the step counter, paying out once it reaches
   *  `clicksRequired`. No-ops (logging an insufficient-cost error) if unaffordable on
   *  that first click; no-ops silently for an unknown id or one that isn't 'clicks'. */
  click(id: string): void {
    const config = CRAFTING_ACTIONS.find(a => a.id === id);
    if (!config || config.mechanic.type !== 'clicks') return;

    const done = this.clickCounts.get(id) ?? 0;
    if (done === 0 && this.wallet.getAmount(config.cost.resourceId) < config.cost.amount) {
      this.logInsufficientCost(config);
      return;
    }
    if (done === 0) this.wallet.add(config.cost.resourceId, -config.cost.amount);

    const next = done + 1;
    if (next >= config.mechanic.clicksRequired) {
      this.clickCounts.delete(id);
      this.payout(config);
    } else {
      this.clickCounts.set(id, next);
    }
    this.changesSource.next();
  }

  private holdProgressMs(instance: HoldInstance, mechanic: HoldMechanic): number {
    const rate = instance.holding ? 1 : -mechanic.decayMultiplier;
    const raw = instance.anchorProgressMs + rate * (Date.now() - instance.anchorAt);
    return Math.min(mechanic.holdMs, Math.max(0, raw));
  }

  /** Detects a 'hold' action crossing either end since the last tick — full charge
   *  (pays out) or fully decayed back to 0 while released (abandons the attempt, so the
   *  next press charges the cost again) — neither of which the live `progressFor`
   *  getter alone would ever act on by itself. */
  private checkHoldCompletions(): void {
    let changed = false;
    for (const config of CRAFTING_ACTIONS) {
      if (config.mechanic.type !== 'hold') continue;
      const instance = this.holdInstances.get(config.id);
      if (!instance) continue;

      const progressMs = this.holdProgressMs(instance, config.mechanic);
      if (progressMs >= config.mechanic.holdMs) {
        const stillHolding = instance.holding;
        this.holdInstances.delete(config.id);
        this.payout(config);
        changed = true;
        // Still physically holding the button the instant this attempt finished —
        // chain straight into the next one rather than requiring a release+re-press,
        // as long as it's still affordable (beginFreshHold logs the same
        // insufficient-cost error and just stops the chain otherwise).
        if (stillHolding) this.beginFreshHold(config);
      } else if (progressMs <= 0 && !instance.holding) {
        this.holdInstances.delete(config.id);
        changed = true;
      }
    }
    if (changed) this.changesSource.next();
  }

  private payout(config: CraftingActionConfig): void {
    // Same "count on completion, not on start" convention as
    // TimedActionsService.payout() — a crafting attempt only counts toward an
    // action-count objective once it's actually finished.
    this.statistics.recordAction(config.id);
    this.wallet.add(config.reward.resourceId, config.reward.amount);
    this.logCompletion(config);
  }

  private logInsufficientCost(config: CraftingActionConfig): void {
    const { label } = getCraftingFlavor(config.id);
    this.activityLog.log(`Not enough ${resourceNameToken(config.cost.resourceId)} to start ${label}.`, 'error');
  }

  private logCompletion(config: CraftingActionConfig): void {
    const { logMessage } = getCraftingFlavor(config.id);
    const gainToken = resourceAmountToken(config.reward.resourceId, config.reward.amount);
    this.activityLog.log(`${logMessage} (${gainToken})`, 'default');
  }

  getSnapshot(): CraftingSnapshot {
    const now = Date.now();
    const holds: Record<string, { progressMs: number; savedAt: number }> = {};
    for (const [id, instance] of this.holdInstances) {
      const config = CRAFTING_ACTIONS.find(a => a.id === id);
      if (!config || config.mechanic.type !== 'hold') continue;
      holds[id] = { progressMs: this.holdProgressMs(instance, config.mechanic), savedAt: now };
    }
    return { holds, clicks: Object.fromEntries(this.clickCounts) };
  }

  restore(snapshot: CraftingSnapshot | undefined): void {
    const now = Date.now();
    const holds = new Map<string, HoldInstance>();
    for (const [id, saved] of Object.entries(snapshot?.holds ?? {})) {
      const config = CRAFTING_ACTIONS.find(a => a.id === id);
      if (!config || config.mechanic.type !== 'hold') continue;
      // Can't literally still be holding right after a reload — apply whatever decay
      // would have happened while the save was closed instead of pretending no time
      // passed, same real-elapsed-time convention TimedActionsService uses.
      const elapsedSinceSave = now - saved.savedAt;
      const progressMs = Math.max(0, saved.progressMs - elapsedSinceSave * config.mechanic.decayMultiplier);
      if (progressMs > 0) holds.set(id, { anchorProgressMs: progressMs, anchorAt: now, holding: false });
    }
    this.holdInstances = holds;
    this.clickCounts = new Map(Object.entries(snapshot?.clicks ?? {}));
    this.changesSource.next();
  }
}
