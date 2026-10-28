import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { UnlocksService } from '../shared/unlocks.service';
import { CharacterSelectService } from '../character-select/character-select.service';
import { migrateId, migrateKeys } from '../shared/renamed-ids';
import { UPGRADES, UpgradeConfig, TimedActionConfig, CraftingActionConfig, UpgradeFeatureId } from '../configs/game-config';

/** One currency's share of the next level's price. */
export interface UpgradeCostAmount {
  resourceId: string;
  amount: number;
}

export interface UpgradeState {
  config: UpgradeConfig;
  level: number;
  /** Every currency the next level costs. Empty once maxed — check `maxed`. */
  costs: UpgradeCostAmount[];
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
 * return (no circular dependency) — this service depends only on `WalletService` plus
 * the two read-only unlock-state services (`UnlocksService`, `CharacterSelectService`)
 * that `UpgradeConfig.prerequisite` is checked against, none of which depend back on it.
 */
@Injectable({ providedIn: 'root' })
export class UpgradesService {
  private wallet = inject(WalletService);
  private systemUnlocks = inject(UnlocksService);
  private characters = inject(CharacterSelectService);

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

  /** Unlocked *and* its live `prerequisite` (if any) is met — what decides whether the
   *  Upgrades panel shows it at all, and whether `purchase` will go through. */
  isAvailable(upgradeId: string): boolean {
    if (!this.isUnlocked(upgradeId)) return false;
    const prerequisite = UPGRADES.find(u => u.id === upgradeId)?.prerequisite;
    if (!prerequisite) return true;
    return prerequisite.type === 'system'
      ? this.systemUnlocks.isUnlocked(prerequisite.systemId)
      : this.characters.isUnlocked(prerequisite.characterId);
  }

  /** Idempotent — unlocking an already-unlocked upgrade is a no-op. */
  unlock(upgradeId: string): void {
    if (this.unlockedIds.has(upgradeId)) return;
    this.unlockedIds.add(upgradeId);
    this.changesSource.next();
  }

  /** Every currency the next level costs, each on its own curve
   *  (ceil(baseCost * costScalingFactor^level)) — undefined once `maxLevel` is reached. */
  costFor(upgrade: UpgradeConfig): UpgradeCostAmount[] | undefined {
    const level = this.getLevel(upgrade.id);
    if (level >= upgrade.maxLevel) return undefined;
    return upgrade.costs.map(c => ({
      resourceId: c.resourceId,
      amount: Math.ceil(c.baseCost * Math.pow(c.costScalingFactor, level)),
    }));
  }

  canAfford(costs: UpgradeCostAmount[]): boolean {
    return costs.every(c => this.wallet.getAmount(c.resourceId) >= c.amount);
  }

  get upgrades(): UpgradeState[] {
    return UPGRADES.map(config => {
      const costs = this.costFor(config);
      return { config, level: this.getLevel(config.id), costs: costs ?? [], maxed: costs === undefined };
    });
  }

  /** Buys one level if available and *every* cost is affordable — all-or-nothing, never
   *  a partial charge. Returns what was charged, or undefined if the purchase didn't
   *  happen (locked / prerequisite unmet / maxed / can't afford). */
  purchase(upgradeId: string): UpgradeCostAmount[] | undefined {
    const config = UPGRADES.find(u => u.id === upgradeId);
    if (!config || !this.isAvailable(upgradeId)) return undefined;

    const costs = this.costFor(config);
    if (!costs || !this.canAfford(costs)) return undefined;

    for (const c of costs) this.wallet.add(c.resourceId, -c.amount);
    this.levels.set(upgradeId, this.getLevel(upgradeId) + 1);
    this.changesSource.next();
    return costs;
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

  /** Bonus added on top of a `GeneratorConfig.ratePerSecond` (e.g. Subcontract) —
   *  read by `PerSecondCalculatorService` whenever it recomputes a resource. */
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

  /** Every timed action `actionId` may auto-start (Multitasking), with its chance
   *  (0..1, clamped) — summed per target across 'auto-start-timed-action' upgrades. */
  getAutoStartChances(actionId: string): { timedActionId: string; chance: number }[] {
    const byTarget = new Map<string, number>();
    for (const upgrade of UPGRADES) {
      const effect = upgrade.effect;
      if (effect.type !== 'auto-start-timed-action' || effect.triggerActionId !== actionId) continue;
      const level = this.getLevel(upgrade.id);
      if (level === 0) continue;
      byTarget.set(effect.timedActionId, (byTarget.get(effect.timedActionId) ?? 0) + effect.chancePerLevel * level);
    }
    return [...byTarget].map(([timedActionId, chance]) => ({ timedActionId, chance: Math.min(chance, 1) }));
  }

  /** Every 'bonus-amount-chance' roll `actionId` gets (Dense Ore) — each a flat chance
   *  for a level-scaled extra amount. Unleveled upgrades are omitted. */
  getBonusAmountRolls(actionId: string): { chance: number; amount: number }[] {
    const rolls: { chance: number; amount: number }[] = [];
    for (const upgrade of UPGRADES) {
      const effect = upgrade.effect;
      if (effect.type !== 'bonus-amount-chance' || effect.actionId !== actionId) continue;
      const level = this.getLevel(upgrade.id);
      if (level > 0) rolls.push({ chance: effect.chance, amount: effect.amountPerLevel * level });
    }
    return rolls;
  }

  /** Charge-speed multiplier for a 'hold' crafting action (Faster Smelting) — 1 with no
   *  levels, 2 at +100%. */
  getCraftingSpeedMultiplier(config: CraftingActionConfig): number {
    let bonus = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'crafting-speed' && upgrade.effect.craftingActionId === config.id) {
        bonus += upgrade.effect.speedPerLevel * this.getLevel(upgrade.id);
      }
    }
    return 1 + bonus;
  }

  /** Uncapped chance fraction that a crafting action's completion refunds one unit of
   *  its cost (Scrappy Resourcefulness) — resolve via `resolveExcessCount`. */
  getCraftingRefundChance(craftingActionId: string): number {
    let chance = 0;
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type === 'crafting-refund-chance' && upgrade.effect.craftingActionId === craftingActionId) {
        chance += upgrade.effect.chancePerLevel * this.getLevel(upgrade.id);
      }
    }
    return chance;
  }

  /** Whether any owned upgrade turns `featureId` on (a 'feature' effect, e.g. Auto Fight). */
  hasFeature(featureId: UpgradeFeatureId): boolean {
    return UPGRADES.some(
      u => u.effect.type === 'feature' && u.effect.featureId === featureId && this.getLevel(u.id) > 0
    );
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
    //
    // Config-default-unlocked ids are always unioned in: an upgrade added later with
    // `unlocked: true` (Dense Ore, ...) must show up for a save written before it existed,
    // whose stored list naturally can't contain it.
    // Upgrade ids renamed since a save was written (RENAMED_IDS) are migrated, so a
    // rename never silently resets a purchased level.
    const defaults = UPGRADES.filter(u => u.unlocked).map(u => u.id);
    if (isUpgradesSnapshot(snapshot)) {
      this.levels = new Map(Object.entries(migrateKeys(snapshot.levels ?? {})));
      this.unlockedIds = new Set([...defaults, ...(snapshot.unlockedIds ?? []).map(migrateId)]);
    } else {
      this.levels = new Map(Object.entries(migrateKeys(snapshot ?? {})));
      this.unlockedIds = new Set(defaults);
    }
    this.changesSource.next();
  }
}
