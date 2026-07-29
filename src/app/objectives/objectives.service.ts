import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { StatisticsService } from '../statistics/statistics.service';
import { CharacterSelectService } from '../character-select/character-select.service';
import { UnlocksService } from '../shared/unlocks.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AttentionService } from '../shared/attention.service';
import { getObjectiveFlavor } from '../configs/flavor-text';
import { OBJECTIVES, ObjectiveConfig, ObjectiveReward } from '../configs/game-config';

export interface ObjectiveState {
  config: ObjectiveConfig;
  current: number;
  target: number;
  /** Target reached but the reward hasn't been claimed yet — the player must click it. */
  claimable: boolean;
  /** Reward already claimed. */
  completed: boolean;
}

export interface ObjectivesSnapshot {
  reachedIds: string[];
  completedIds: string[];
}

/**
 * Evaluates OBJECTIVES against live statistics. Reaching a target makes an
 * objective *claimable*, not completed — `claim()` is what actually applies the reward,
 * so a player always clicks to collect it rather than a reward silently firing the
 * instant a number crosses a threshold. Both "reached" and "claimed" are sticky, tracked
 * independently of the live current/target numbers, same reasoning as before: spending
 * a resource back down (or any future regression in the underlying counter) must never
 * un-reach or un-claim an objective already past that point.
 *
 * 'resource-threshold' deliberately reads *lifetime* gained (`StatisticsService`), not
 * the current wallet balance — "obtain 100 gold" should track total gold ever earned,
 * so spending it (on an upgrade, say) never undoes progress toward the objective. This
 * is why this service depends on `StatisticsService` only, not `WalletService` directly.
 */
@Injectable({ providedIn: 'root' })
export class ObjectivesService {
  private statistics = inject(StatisticsService);
  private characterService = inject(CharacterSelectService);
  private unlocks = inject(UnlocksService);
  private upgrades = inject(UpgradesService);
  private activityLog = inject(ActivityLogService);
  private attention = inject(AttentionService);

  private reachedIds = new Set<string>();
  private completedIds = new Set<string>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    // Both objective types' progress lives in StatisticsService now — resource-threshold
    // off lifetime-gained, action-count off action counts — so one subscription covers
    // re-evaluating every objective.
    this.statistics.changes$.subscribe(() => this.evaluateAll());
  }

  get objectives(): ObjectiveState[] {
    return OBJECTIVES.filter(config => this.isAvailable(config)).map(config => {
      const target = this.targetFor(config);
      return {
        config,
        current: Math.min(this.currentFor(config), target),
        target,
        claimable: this.reachedIds.has(config.id),
        completed: this.completedIds.has(config.id),
      };
    });
  }

  /** Applies the objective's reward and marks it claimed. No-op unless it's actually
   *  claimable (target reached, not already claimed) — safe to call speculatively from
   *  a click handler without checking state first. */
  claim(objectiveId: string): void {
    if (!this.reachedIds.has(objectiveId) || this.completedIds.has(objectiveId)) return;
    const config = OBJECTIVES.find(o => o.id === objectiveId);
    if (!config) return;

    this.reachedIds.delete(objectiveId);
    this.completedIds.add(objectiveId);
    for (const reward of config.rewards ?? []) this.applyReward(reward);

    // Claiming is a real, player-initiated game action — it logs like one. Exception to
    // the usual "flavor sentence + colored resource token" shape (see AGENTS.md): an
    // objective's reward is a character/system unlock, not a currency amount, so there's
    // no token to append. Logged at 'success' rather than 'default' since a completed
    // objective is a noteworthy milestone, not routine play.
    this.activityLog.log(getObjectiveFlavor(objectiveId).logMessage, 'success');
    this.changesSource.next();
  }

  private evaluateAll(): void {
    let changed = false;
    for (const config of OBJECTIVES) {
      if (!this.isAvailable(config)) continue;
      if (this.reachedIds.has(config.id) || this.completedIds.has(config.id)) continue;
      changed = true; // live progress moved — the panel needs to re-render even before the target is hit
      if (this.currentFor(config) >= this.targetFor(config)) {
        this.reachedIds.add(config.id);
      }
    }
    if (changed) this.changesSource.next();
  }

  /** Whether a prerequisite-gated objective should even be visible yet — undefined
   *  `prerequisiteCharacterId` means always available. Same "invisible until unlocked"
   *  treatment as a locked character/upgrade, rather than a dimmed/locked placeholder row. */
  private isAvailable(config: ObjectiveConfig): boolean {
    return !config.prerequisiteCharacterId || this.characterService.isUnlocked(config.prerequisiteCharacterId);
  }

  private currentFor(config: ObjectiveConfig): number {
    switch (config.type) {
      case 'resource-threshold':
        return this.statistics.getLifetimeGainedFor(config.resourceId);
      case 'action-count':
        return this.totalActionCount();
      case 'specific-action-count':
        return this.statistics.getActionCount(config.actionId);
    }
  }

  private targetFor(config: ObjectiveConfig): number {
    return config.type === 'resource-threshold' ? config.targetAmount : config.targetCount;
  }

  /** "Work N times" counts every recorded action press, not one specific character's
   *  button — stays meaningful as more characters/actions are added. */
  private totalActionCount(): number {
    return this.statistics.getActionCounts().reduce((sum, [, count]) => sum + count, 0);
  }

  private applyReward(reward: ObjectiveReward): void {
    switch (reward.type) {
      case 'character':
        this.characterService.unlock(reward.characterId);
        // Unlocking a character can reveal a previously-hidden prerequisite-gated
        // objective (see ObjectiveConfig.prerequisiteCharacterId) — re-shine the
        // Objectives tab at the exact transition, rather than relying on the fresh-game
        // seed (SaveService.seedFreshGameAttention), which only covers objectives
        // available from the very start.
        if (OBJECTIVES.some(o => o.prerequisiteCharacterId === reward.characterId)) {
          this.attention.markUnseen('tab:objectives');
        }
        break;
      case 'system':
        this.unlocks.unlock(reward.systemId);
        break;
      case 'upgrade':
        this.upgrades.unlock(reward.upgradeId);
        break;
    }
  }

  getSnapshot(): ObjectivesSnapshot {
    return { reachedIds: [...this.reachedIds], completedIds: [...this.completedIds] };
  }

  restore(snapshot: ObjectivesSnapshot | undefined): void {
    this.reachedIds = new Set(snapshot?.reachedIds ?? []);
    this.completedIds = new Set(snapshot?.completedIds ?? []);
    this.changesSource.next();
  }
}
