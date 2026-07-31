import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from '../fighter-combat/equipment.service';
import { PATTERNS, PatternConfig, EQUIPMENT_SLOTS, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getPatternFlavor, getEquipmentFlavor } from '../configs/flavor-text';
import { resourceNameToken } from '../shared/resource-token';

export interface PatternCraftingSnapshot {
  knownPatternIds: string[];
  active: { patternId: string; startedAt: number } | null;
}

export interface PatternState {
  config: PatternConfig;
  known: boolean;
  /** Whether the Fighter currently holds config.equipmentId (equipped or in inventory) —
   *  once true, this pattern can't be crafted again until a future upgrade-tier pattern
   *  supersedes it (see AGENTS.md's "one item per slot-line" rule). */
  owned: boolean;
  /** True while this exact pattern is the one currently crafting. */
  active: boolean;
  /** 0..1 elapsed fraction of durationMs — 0 whenever this pattern isn't the active one. */
  progress: number;
}

/**
 * Owns the Blacksmith's known-pattern set and at most one active craft — modeled on
 * TimedActionsService's absolute-timestamp-anchor pattern (a passive real-time wait, not
 * an active hold/click), but constrained to a single concurrent craft across every
 * pattern, not one timer per id. A pattern, once known, stays known forever (a recipe
 * unlock, not a consumable); each pattern represents one equipment slot-line for the
 * Fighter, not a repeatable stack — see `isOwned` and AGENTS.md.
 */
@Injectable({ providedIn: 'root' })
export class PatternCraftingService {
  private wallet = inject(WalletService);
  private statistics = inject(StatisticsService);
  private activityLog = inject(ActivityLogService);
  private equipment = inject(EquipmentService);

  private knownPatternIds = new Set<string>(PATTERNS.filter(p => p.unlocked).map(p => p.id));
  private activeCraft: { patternId: string; startedAt: number } | null = null;

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    setInterval(() => this.checkCompletions(), TIMED_ACTION_TICK_MS);
  }

  get patterns(): PatternState[] {
    return PATTERNS.map(config => ({
      config,
      known: this.knownPatternIds.has(config.id),
      owned: this.isOwned(config),
      active: this.activeCraft?.patternId === config.id,
      progress: this.getProgress(config.id),
    }));
  }

  isOwned(config: PatternConfig): boolean {
    return this.isHeldAnywhere(config.equipmentId);
  }

  getProgress(patternId: string): number {
    if (!this.activeCraft || this.activeCraft.patternId !== patternId) return 0;
    const config = PATTERNS.find(p => p.id === patternId);
    if (!config) return 0;
    return Math.min((Date.now() - this.activeCraft.startedAt) / config.durationMs, 1);
  }

  /** Idempotent — the future hook for a combat-dropped pattern (see CombatService). */
  unlock(patternId: string): void {
    if (this.knownPatternIds.has(patternId)) return;
    this.knownPatternIds.add(patternId);
    this.changesSource.next();
  }

  /** No-op if the pattern is unknown, already owned, its upgrade prerequisite isn't
   *  held, a different craft is already active, or any cost entry is unaffordable
   *  (logging an insufficient-cost error in that last case, same convention as
   *  TimedActionsService.start). */
  start(patternId: string): void {
    const config = PATTERNS.find(p => p.id === patternId);
    if (!config) return;
    if (!this.knownPatternIds.has(patternId)) return;
    if (this.activeCraft) return;
    if (this.isOwned(config)) return;
    if (config.upgradesFromEquipmentId && !this.isHeldAnywhere(config.upgradesFromEquipmentId)) return;

    for (const entry of config.cost) {
      if (this.wallet.getAmount(entry.resourceId) < entry.amount) {
        this.logInsufficientCost(config, entry.resourceId);
        return;
      }
    }
    for (const entry of config.cost) {
      this.wallet.add(entry.resourceId, -entry.amount);
    }

    this.activeCraft = { patternId, startedAt: Date.now() };
    this.changesSource.next();
  }

  private isHeldAnywhere(itemId: string): boolean {
    if (this.equipment.getInventoryCount(itemId) > 0) return true;
    return EQUIPMENT_SLOTS.some(slot => this.equipment.getEquippedItemId(slot.id) === itemId);
  }

  private checkCompletions(): void {
    if (!this.activeCraft) return;
    const config = PATTERNS.find(p => p.id === this.activeCraft!.patternId);
    if (!config) {
      // Defensive: PATTERNS shrank while a craft was active in memory — clear rather
      // than spin forever checking a config that no longer exists, same reasoning as
      // CombatService's stale-enemy guard.
      this.activeCraft = null;
      this.changesSource.next();
      return;
    }
    if (Date.now() - this.activeCraft.startedAt < config.durationMs) return;

    this.grantReward(config);
    this.activeCraft = null;
    this.changesSource.next();
  }

  private grantReward(config: PatternConfig): void {
    // Same "count on completion, not on start" convention as TimedActionsService/
    // CraftingService.
    this.statistics.recordAction(config.id);
    if (config.upgradesFromEquipmentId) {
      this.equipment.replaceInventoryItem(config.upgradesFromEquipmentId, config.equipmentId);
    } else {
      this.equipment.addToInventory(config.equipmentId);
    }
    this.logCompletion(config);
  }

  private logInsufficientCost(config: PatternConfig, resourceId: string): void {
    const { label } = getPatternFlavor(config.id);
    this.activityLog.log(`Not enough ${resourceNameToken(resourceId)} to start ${label}.`, 'error');
  }

  /** 'success', not 'default' — a completed craft is a noteworthy, non-routine event
   *  (same tier as an Objective claim or a combat victory), and there's no currency
   *  amount to append as a colored token, so the item's plain label goes in parens
   *  instead — matching how a combat equipment drop already logs (see CombatService). */
  private logCompletion(config: PatternConfig): void {
    const { logMessage } = getPatternFlavor(config.id);
    const itemLabel = getEquipmentFlavor(config.equipmentId).label;
    this.activityLog.log(`${logMessage} (${itemLabel})`, 'success');
  }

  getSnapshot(): PatternCraftingSnapshot {
    return {
      knownPatternIds: [...this.knownPatternIds],
      active: this.activeCraft ? { ...this.activeCraft } : null,
    };
  }

  restore(snapshot: PatternCraftingSnapshot | undefined): void {
    const defaults = PATTERNS.filter(p => p.unlocked).map(p => p.id);
    this.knownPatternIds = new Set(snapshot?.knownPatternIds ?? defaults);

    const restoredActive = snapshot?.active;
    const configStillExists = !!restoredActive && PATTERNS.some(p => p.id === restoredActive.patternId);
    this.activeCraft = restoredActive && configStillExists ? { ...restoredActive } : null;
    this.changesSource.next();
  }
}
