import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { CharacterSelectService } from '../character-select/character-select.service';
import { UnlocksService } from '../shared/unlocks.service';
import { OBJECTIVES, ObjectiveConfig, ObjectiveReward } from '../configs/game-config';

export interface ObjectiveState {
  config: ObjectiveConfig;
  current: number;
  completed: boolean;
}

/** Evaluates OBJECTIVES against live wallet state and applies each objective's reward
 *  the moment its target is met. Completion is sticky — persisted separately from
 *  wallet amount, so spending back down doesn't un-complete it. */
@Injectable({ providedIn: 'root' })
export class ObjectivesService {
  private wallet = inject(WalletService);
  private characterService = inject(CharacterSelectService);
  private unlocks = inject(UnlocksService);

  private completedIds = new Set<string>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    this.wallet.changes$.subscribe(({ resourceId }) => this.evaluate(resourceId));
  }

  get objectives(): ObjectiveState[] {
    return OBJECTIVES.map(o => ({
      config: o,
      current: Math.min(this.wallet.getAmount(o.resourceId), o.targetAmount),
      completed: this.completedIds.has(o.id),
    }));
  }

  private evaluate(resourceId: string): void {
    let changed = false;
    for (const objective of OBJECTIVES) {
      if (objective.resourceId !== resourceId || this.completedIds.has(objective.id)) continue;
      changed = true; // progress toward this objective moved — the panel needs to re-render live
      if (this.wallet.getAmount(objective.resourceId) >= objective.targetAmount) {
        this.complete(objective);
      }
    }
    if (changed) this.changesSource.next();
  }

  private complete(objective: ObjectiveConfig): void {
    this.completedIds.add(objective.id);
    if (objective.reward) {
      this.applyReward(objective.reward);
    }
  }

  private applyReward(reward: ObjectiveReward): void {
    switch (reward.type) {
      case 'character':
        this.characterService.unlock(reward.characterId);
        break;
      case 'system':
        this.unlocks.unlock(reward.systemId);
        break;
      case 'upgrade':
        // No "locked" concept for upgrades yet — every entry in UPGRADES is visible from
        // the start (see UpgradesService). Once one needs gating behind an objective,
        // give UpgradesService an unlocked-id set the same shape as
        // CharacterSelectService's, and route through it here the same way 'system' does.
        break;
    }
  }

  getCompletedIds(): string[] {
    return [...this.completedIds];
  }

  restore(ids: string[] | undefined): void {
    this.completedIds = new Set(ids ?? []);
    this.changesSource.next();
  }
}
