import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { UnlocksService } from '../shared/unlocks.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { formatSigned } from '../shared/number-format';
import { resolveExcessCount } from '../shared/chance';
import { TIMED_ACTIONS, TimedActionConfig, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getTimedActionFlavor, RESOURCE_FLAVOR } from '../configs/flavor-text';

export interface TimedActionState {
  config: TimedActionConfig;
  unlocked: boolean;
  /** Actively counting down — false once the duration has elapsed, even for a
   *  `requiresCollection` action still waiting on `ready`. */
  running: boolean;
  /** Timer elapsed, `config.requiresCollection` is set, and the reward is waiting on a
   *  collect click — always false for an auto-completing action. */
  ready: boolean;
  /** 0..1 elapsed fraction of the effective duration. 0 whenever nothing is running. */
  progress: number;
}

interface TimedActionInstance {
  startedAt: number;
  /** Only set for a 'random'-duration action — the value rolled once at start(), read
   *  live by UpgradesService.getTimedActionDurationMs on every check/render instead of
   *  being re-rolled. */
  rolledMs?: number;
}

/** Per-action-id running instances — see class doc for why a start timestamp (plus, for
 *  a random-duration action, its one-time roll) is enough to survive a screen change or a
 *  reload without drifting. Pre-`requiresCollection` saves stored a bare timestamp
 *  number instead of `TimedActionInstance` — restore() normalizes either shape. */
export type TimedActionsSnapshot = Record<string, TimedActionInstance | number>;

/**
 * Manual "start a timer, get paid later" buttons — Guild Contract (§ TIMED_ACTIONS in
 * game-config.ts) is the first, Bait Trap the second. Every button of this kind in the
 * game should be built on this same service rather than a one-off component timer:
 *
 * Running state is a single absolute start timestamp per action id, not a countdown or
 * a `setTimeout`. Completion is resolved by comparing real elapsed time
 * (`Date.now() - startedAt`) against the *effective* duration —
 * `UpgradesService.getTimedActionDurationMs(config, rolledMs)`, `config.duration` after
 * any `timed-action-duration` upgrade (e.g. Faster Contracts) — on this service's own
 * `TIMED_ACTION_TICK_MS` interval, deliberately *not* `GameLoopService`'s 1s tick: the
 * progress bar (`ButtonZoneComponent`) already re-renders every `TIMED_ACTION_TICK_MS`
 * for smoothness, and checking completion only once a second let the fill sit at 100%
 * for up to a second before the action actually completed — a visible "hang" at the
 * end. Sharing one constant for both is what keeps the bar's 100% moment and the actual
 * completion within a tick of each other. That's what makes the timer keep running (and
 * finish on time) no matter what character/screen is on display, since nothing about it
 * depends on this service's consumer staying mounted, and what makes it survive a page
 * reload mid-run: restoring a past `startedAt` from the save just means "more time has
 * already elapsed" on the very next tick. A 'fixed' duration is read entirely live rather
 * than snapshotted at start, so buying a duration upgrade mid-run can complete an
 * already-running contract early — a pleasant surprise, not a bug. A 'random' duration
 * (Bait Trap) rolls its base once at start (`TimedActionInstance.rolledMs`) since that
 * roll must be unknown to the player and stable for the run, but any duration *upgrade*
 * still applies to it live the same way.
 *
 * A `requiresCollection` action (Bait Trap) doesn't pay out the moment its timer elapses
 * — `checkCompletions` leaves its instance in place and just flags it `ready` (see
 * `notifiedReady`) so the button can switch to its "collect" label; the actual payout
 * only happens when the player clicks again (`collect`).
 */
@Injectable({ providedIn: 'root' })
export class TimedActionsService {
  private wallet = inject(WalletService);
  private unlocks = inject(UnlocksService);
  private upgrades = inject(UpgradesService);
  private activityLog = inject(ActivityLogService);

  private instances = new Map<string, TimedActionInstance>();
  /** Ids currently sitting in the `ready` phase — just what lets `checkCompletions` push
   *  exactly one `changes$` at the running->ready transition, not every tick after. */
  private notifiedReady = new Set<string>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    setInterval(() => this.checkCompletions(), TIMED_ACTION_TICK_MS);
  }

  get actions(): TimedActionState[] {
    return TIMED_ACTIONS.map(config => this.stateFor(config));
  }

  stateFor(config: TimedActionConfig): TimedActionState {
    const instance = this.instances.get(config.id);
    const durationMs = this.upgrades.getTimedActionDurationMs(config, instance?.rolledMs);
    const elapsed = instance ? Date.now() - instance.startedAt : 0;
    const ready = !!instance && !!config.requiresCollection && elapsed >= durationMs;
    const running = !!instance && !ready;
    const progress = instance ? Math.min(elapsed / durationMs, 1) : 0;
    const unlocked = config.unlockKey ? this.unlocks.isUnlocked(config.unlockKey) : true;
    return { config, unlocked, running, ready, progress };
  }

  /** No-op if locked, already in progress, or unaffordable (`config.cost`) — safe to call
   *  directly from a click handler without checking state first. */
  start(id: string): void {
    const config = TIMED_ACTIONS.find(a => a.id === id);
    if (!config) return;
    if (config.unlockKey && !this.unlocks.isUnlocked(config.unlockKey)) return;
    if (this.instances.has(id)) return;
    if (config.cost && this.wallet.getAmount(config.cost.resourceId) < config.cost.amount) return;

    if (config.cost) this.wallet.add(config.cost.resourceId, -config.cost.amount);
    const rolledMs =
      config.duration.type === 'random'
        ? config.duration.minMs + Math.random() * (config.duration.maxMs - config.duration.minMs)
        : undefined;
    this.instances.set(id, { startedAt: Date.now(), rolledMs });
    this.changesSource.next();
  }

  /** Collects a `requiresCollection` action's reward once it's actually `ready` —
   *  no-op otherwise (still running, unknown, or already collected). */
  collect(id: string): void {
    const config = TIMED_ACTIONS.find(a => a.id === id);
    if (!config || !config.requiresCollection) return;
    if (!this.stateFor(config).ready) return;

    this.instances.delete(id);
    this.notifiedReady.delete(id);
    this.payout(config);
    this.changesSource.next();
  }

  private checkCompletions(): void {
    let changed = false;
    for (const config of TIMED_ACTIONS) {
      const instance = this.instances.get(config.id);
      if (!instance) continue;
      const durationMs = this.upgrades.getTimedActionDurationMs(config, instance.rolledMs);
      if (Date.now() - instance.startedAt < durationMs) continue;

      if (config.requiresCollection) {
        // Timer's up, but the player collects explicitly — just flag it once so the
        // component re-renders into the "ready" label promptly, don't pay out yet.
        if (!this.notifiedReady.has(config.id)) {
          this.notifiedReady.add(config.id);
          changed = true;
        }
      } else {
        this.instances.delete(config.id);
        this.payout(config);
        changed = true;
      }
    }
    if (changed) this.changesSource.next();
  }

  private payout(config: TimedActionConfig): void {
    const baseAmount = config.reward.amount + this.upgrades.getTimedActionYieldBonus(config.id);
    const doubled = Math.random() < this.upgrades.getPayoutDoubleChance(config.id);
    const amount = doubled ? baseAmount * 2 : baseAmount;
    this.wallet.add(config.reward.resourceId, amount);

    let bonusAmount = 0;
    if (config.bonusReward) {
      const chance = config.bonusReward.chance + this.upgrades.getBonusRewardChance(config.id);
      bonusAmount = resolveExcessCount(chance);
      if (bonusAmount > 0) this.wallet.add(config.bonusReward.resourceId, bonusAmount);
    }

    this.logCompletion(config, amount, doubled, bonusAmount);
  }

  private logCompletion(config: TimedActionConfig, amount: number, doubled: boolean, bonusAmount: number): void {
    const { logMessage } = getTimedActionFlavor(config.id);
    const resource = RESOURCE_FLAVOR[config.reward.resourceId];
    const gainToken = `{{${config.reward.resourceId}|${formatSigned(amount)} ${resource.symbol}}}`;

    let message = `${logMessage} (${gainToken})`;
    if (bonusAmount > 0 && config.bonusReward) {
      const bonusResource = RESOURCE_FLAVOR[config.bonusReward.resourceId];
      const bonusToken = `{{${config.bonusReward.resourceId}|${formatSigned(bonusAmount)} ${bonusResource.symbol}}}`;
      message = `${logMessage} (${gainToken}, ${bonusToken})`;
    }
    // A doubled payout (Bonus Payout upgrade) or a bonus reward (Clean Traps' Pelt) is a
    // noteworthy lucky break, not routine play — 'success' instead of 'default', same
    // reasoning as the Objectives claim log.
    this.activityLog.log(message, doubled || bonusAmount > 0 ? 'success' : 'default');
  }

  getSnapshot(): TimedActionsSnapshot {
    return Object.fromEntries(this.instances);
  }

  restore(snapshot: TimedActionsSnapshot | undefined): void {
    // Pre-`requiresCollection` saves stored a bare startedAt number per id — normalize
    // that older flat shape into a TimedActionInstance rather than crashing or dropping
    // an in-progress Guild Contract on load (see AGENTS.md's forward-compat rule).
    const entries = Object.entries(snapshot ?? {}).map(
      ([id, value]): [string, TimedActionInstance] => [
        id,
        typeof value === 'number' ? { startedAt: value } : value,
      ]
    );
    this.instances = new Map(entries);
    this.notifiedReady = new Set(
      entries
        .filter(([id, instance]) => {
          const config = TIMED_ACTIONS.find(a => a.id === id);
          if (!config?.requiresCollection) return false;
          const durationMs = this.upgrades.getTimedActionDurationMs(config, instance.rolledMs);
          return Date.now() - instance.startedAt >= durationMs;
        })
        .map(([id]) => id)
    );
    this.changesSource.next();
  }
}
