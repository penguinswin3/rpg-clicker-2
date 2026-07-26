import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { UPGRADES, UpgradeConfig } from '../configs/game-config';

export interface UpgradeState {
  config: UpgradeConfig;
  level: number;
  /** Cost to buy the next level, in `config.resourceId`. 0 once maxed — check `maxed`. */
  cost: number;
  maxed: boolean;
}

/**
 * Owns upgrade levels and resolves each upgrade's effect into a bonus another service
 * can add on top of its own base value — `ButtonZoneComponent` asks for
 * `getActionAmountBonus(actionId)`, `PerSecondCalculatorService` asks for
 * `getGeneratorRateBonus(generatorId)`. Neither of those services is asked about in
 * return (no circular dependency) — this service only ever depends on `WalletService`.
 */
@Injectable({ providedIn: 'root' })
export class UpgradesService {
  private wallet = inject(WalletService);

  private levels = new Map<string, number>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  getLevel(upgradeId: string): number {
    return this.levels.get(upgradeId) ?? 0;
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

  /** Buys one level if affordable. Returns the cost charged (for logging the exact
   *  amount spent), or undefined if the purchase didn't happen (maxed / can't afford). */
  purchase(upgradeId: string): number | undefined {
    const config = UPGRADES.find(u => u.id === upgradeId);
    if (!config) return undefined;

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

  getSnapshot(): Record<string, number> {
    return Object.fromEntries(this.levels);
  }

  restore(snapshot: Record<string, number> | undefined): void {
    this.levels = new Map(Object.entries(snapshot ?? {}));
    this.changesSource.next();
  }
}
