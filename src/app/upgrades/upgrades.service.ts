import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { AttentionService } from '../shared/attention.service';
import { UPGRADES, UpgradeConfig, TimedActionConfig } from '../configs/game-config';

export interface UpgradeState {
  config: UpgradeConfig;
  level: number;
  /** Cost to buy the next level, in `config.resourceId`. 0 once maxed — check `maxed`. */
  cost: number;
  maxed: boolean;
}

export interface UpgradesSnapshot {
  levels: Record<string, number>;
  unlockedIds: string[];
}

function isUpgradesSnapshot(
  snapshot: UpgradesSnapshot | Record<string, number> | undefined
): snapshot is UpgradesSnapshot {
  return !!snapshot && 'levels' in snapshot;
}

/**
 * Owns upgrade levels + unlock state, and resolves each upgrade's effect into a bonus
 * another service can add on top of its own base value — `ButtonZoneComponent` asks for
 * `getActionAmountBonus(actionId)`, `PerSecondCalculatorService` asks for
 * `getGeneratorRateBonus(generatorId)`, `TimedActionsService` asks for the three
 * timed-action bonuses below. Neither of those services is asked about in
 * return (no circular dependency) — this service only ever depends on `WalletService`
 * and `AttentionService`.
 */
@Injectable({ providedIn: 'root' })
export class UpgradesService {
  private wallet = inject(WalletService);
  private attention = inject(AttentionService);

  private levels = new Map<string, number>();
  private unlockedIds = new Set<string>(UPGRADES.filter(u => u.unlocked).map(u => u.id));

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  getLevel(upgradeId: string): number {
    return this.levels.get(upgradeId) ?? 0;
  }

  isUnlocked(upgradeId: string): boolean {
    return this.unlockedIds.has(upgradeId);
  }

  /** Idempotent — unlocking an already-unlocked upgrade is a no-op. Re-shines the
   *  Upgrades tab (see AGENTS.md) since this is exactly the "a newly-available upgrade
   *  was just revealed" moment that shine is meant for. */
  unlock(upgradeId: string): void {
    if (this.unlockedIds.has(upgradeId)) return;
    this.unlockedIds.add(upgradeId);
    this.attention.markUnseen('tab:upgrades');
    this.changesSource.next();
  }

  /** Cost to buy the next level of this upgrade — undefined once `maxLevel` is reached. */
  costFor(upgrade: UpgradeConfig): number | undefined {
    const level = this.getLevel(upgrade.id);
    if (level >= upgrade.maxLevel) return undefined;
    return Math.ceil(upgrade.baseCost * Math.pow(upgrade.costScalingFactor, level));
  }

  get upgrades(): UpgradeState[] {
    return UPGRADES.map(config => {
      const cost = this.costFor(config);
      return { config, level: this.getLevel(config.id), cost: cost ?? 0, maxed: cost === undefined };
    });
  }

  /** Buys one level if unlocked and affordable. Returns the cost charged (for logging
   *  the exact amount spent), or undefined if the purchase didn't happen (locked /
   *  maxed / can't afford). */
  purchase(upgradeId: string): number | undefined {
    const config = UPGRADES.find(u => u.id === upgradeId);
    if (!config || !this.isUnlocked(upgradeId)) return undefined;

    const cost = this.costFor(config);
    if (cost === undefined || this.wallet.getAmount(config.resourceId) < cost) return undefined;

    this.wallet.add(config.resourceId, -cost);
    this.levels.set(upgradeId, this.getLevel(upgradeId) + 1);
    this.changesSource.next();
    return cost;
  }

  /** Bonus added on top of a `CharacterActionConfig.amountPerAction`, summed across every
   *  upgrade whose effect targets that action. */
  getActionAmountBonus(actionId: string): number {
    let bonus = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'action-amount' && upgrade.effect.actionId === actionId) {
        bonus += upgrade.effect.amountPerLevel * this.getLevel(upgrade.id);
      }
    }
    return bonus;
  }

  /** Bonus added on top of a `GeneratorConfig.ratePerSecond` — not exercised by any
   *  generator yet (`GENERATORS` is empty), but `PerSecondCalculatorService` already
   *  reads this and reacts to `changes$`, so wiring up a real generator later just works. */
  getGeneratorRateBonus(generatorId: string): number {
    let bonus = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'generator-rate' && upgrade.effect.generatorId === generatorId) {
        bonus += upgrade.effect.ratePerLevel * this.getLevel(upgrade.id);
      }
    }
    return bonus;
  }

  /** Bonus added on top of a `TimedActionConfig.reward.amount`, summed across every
   *  upgrade whose effect targets that timed action (e.g. High Quality Contracts). */
  getTimedActionYieldBonus(timedActionId: string): number {
    let bonus = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'timed-action-yield' && upgrade.effect.timedActionId === timedActionId) {
        bonus += upgrade.effect.amountPerLevel * this.getLevel(upgrade.id);
      }
    }
    return bonus;
  }

  /** Effective duration for a timed action after every `timed-action-duration` upgrade
   *  targeting it (e.g. Faster Contracts) — multiplicative decay per level, applied live
   *  off current upgrade levels rather than snapshotted at start time, see AGENTS.md.
   *  `rolledMs` is the value already rolled for this run of a 'random'-duration action
   *  (see TimedActionsService) — required for those, ignored for 'fixed' ones. Falls back
   *  to the range's midpoint when computing an inactive random action's nominal duration
   *  (nothing is actually counting down yet, so there's no real roll to read). */
  getTimedActionDurationMs(config: TimedActionConfig, rolledMs?: number): number {
    let durationMs =
      config.duration.type === 'fixed'
        ? config.duration.ms
        : rolledMs ?? (config.duration.minMs + config.duration.maxMs) / 2;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'timed-action-duration' && upgrade.effect.timedActionId === config.id) {
        durationMs *= Math.pow(1 - upgrade.effect.decayPerLevel, this.getLevel(upgrade.id));
      }
    }
    return durationMs;
  }

  /** Chance (0..1) that `actionId`'s next payout should be doubled, summed across every
   *  `payout-double-chance` upgrade that targets it and clamped at 100%. */
  getPayoutDoubleChance(actionId: string): number {
    let chance = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'payout-double-chance' && upgrade.effect.targetActionIds.includes(actionId)) {
        chance += upgrade.effect.chancePerLevel * this.getLevel(upgrade.id);
      }
    }
    return Math.min(chance, 1);
  }

  /** Uncapped chance fraction that `actionId`'s yield should be doubled, summed across
   *  every `cascading-double-chance` upgrade targeting it (e.g. Better Offcuts) — pass
   *  through `resolveExcessCount` (shared/chance.ts) to get an actual doubling count,
   *  since this can exceed 1.0. */
  getCascadingDoubleChance(actionId: string): number {
    let chance = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'cascading-double-chance' && upgrade.effect.targetActionIds.includes(actionId)) {
        chance += upgrade.effect.chancePerLevel * this.getLevel(upgrade.id);
      }
    }
    return chance;
  }

  /** Uncapped chance fraction added on top of a `TimedActionConfig.bonusReward`'s base
   *  chance, summed across every `bonus-reward-chance` upgrade targeting it (e.g. Clean
   *  Traps) — the caller (TimedActionsService.payout) adds this to the config's base
   *  chance before rolling via `resolveExcessCount`. */
  getBonusRewardChance(timedActionId: string): number {
    let chance = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'bonus-reward-chance' && upgrade.effect.timedActionId === timedActionId) {
        chance += upgrade.effect.chancePerLevel * this.getLevel(upgrade.id);
      }
    }
    return chance;
  }

  // ── Dev tools ─────────────────────────────────────────────────

  maxAll(): void {
    for (const upgrade of UPGRADES) this.levels.set(upgrade.id, upgrade.maxLevel);
    this.changesSource.next();
  }

  /** Rounds up so a maxLevel of 1 still lands on 1, not 0. */
  halveAll(): void {
    for (const upgrade of UPGRADES) this.levels.set(upgrade.id, Math.max(1, Math.ceil(upgrade.maxLevel / 2)));
    this.changesSource.next();
  }

  resetAll(): void {
    this.levels.clear();
    this.changesSource.next();
  }

  getSnapshot(): UpgradesSnapshot {
    return { levels: Object.fromEntries(this.levels), unlockedIds: [...this.unlockedIds] };
  }

  restore(snapshot: UpgradesSnapshot | Record<string, number> | undefined): void {
    // Pre-unlock-system saves stored the level map directly as `upgrades` (no wrapping
    // object) — `isUpgradesSnapshot` tells a real UpgradesSnapshot apart from that older
    // flat shape, so an old save still restores its levels, just with every upgrade's
    // unlock state reset to its config default (there was nothing else to read) rather
    // than crashing or silently dropping the whole field.
    if (isUpgradesSnapshot(snapshot)) {
      this.levels = new Map(Object.entries(snapshot.levels ?? {}));
      this.unlockedIds = new Set(snapshot.unlockedIds ?? UPGRADES.filter(u => u.unlocked).map(u => u.id));
    } else {
      this.levels = new Map(Object.entries(snapshot ?? {}));
      this.unlockedIds = new Set(UPGRADES.filter(u => u.unlocked).map(u => u.id));
    }
    this.changesSource.next();
  }
}
