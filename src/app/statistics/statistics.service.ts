import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';

export interface MajorUnlockRecord {
  id: string;
  label: string;
  timestamp: number;
}

export interface StatisticsSnapshot {
  actionCounts: Record<string, number>;
  lifetimeGained: Record<string, number>;
  majorUnlocks: MajorUnlockRecord[];
}

/**
 * Tracks lifetime play stats: manual action counts, lifetime currency gained per
 * resource, and timestamped major unlocks (new characters, systems). Sections in
 * StatsPanelComponent appear only once there's data for them — this service doesn't
 * pre-seed anything, it only ever records what's actually happened.
 */
@Injectable({ providedIn: 'root' })
export class StatisticsService {
  private wallet = inject(WalletService);

  private actionCounts = new Map<string, number>();
  private lifetimeGained = new Map<string, number>();
  private majorUnlocks: MajorUnlockRecord[] = [];

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    // Only real gains count toward lifetime totals — restore() emits delta:0 so
    // loading a save doesn't inflate this on top of the value it's also restoring.
    this.wallet.changes$.subscribe(({ resourceId, delta }) => {
      if (delta > 0) {
        this.lifetimeGained.set(resourceId, (this.lifetimeGained.get(resourceId) ?? 0) + delta);
        this.changesSource.next();
      }
    });
  }

  getActionCounts(): [string, number][] {
    return [...this.actionCounts.entries()];
  }

  /** Count for one specific action id — 0 if never recorded. Used by
   *  `ObjectivesService` for a 'specific-action-count' objective, which (unlike
   *  'action-count') must track exactly one action rather than every recorded one. */
  getActionCount(actionId: string): number {
    return this.actionCounts.get(actionId) ?? 0;
  }

  getLifetimeGained(): [string, number][] {
    return [...this.lifetimeGained.entries()];
  }

  /** Lifetime amount gained for one resource — 0 if none recorded yet. Used by
   *  `ObjectivesService` for 'resource-threshold' objectives, which track *lifetime*
   *  earned rather than the current wallet balance, so spending gold back down never
   *  undoes progress toward one. */
  getLifetimeGainedFor(resourceId: string): number {
    return this.lifetimeGained.get(resourceId) ?? 0;
  }

  getMajorUnlocks(): MajorUnlockRecord[] {
    return this.majorUnlocks;
  }

  recordAction(actionId: string): void {
    this.actionCounts.set(actionId, (this.actionCounts.get(actionId) ?? 0) + 1);
    this.changesSource.next();
  }

  /** Idempotent — recording the same id twice (e.g. re-evaluated on save load) is a no-op. */
  recordMajorUnlock(id: string, label: string): void {
    if (this.majorUnlocks.some(u => u.id === id)) return;
    this.majorUnlocks.push({ id, label, timestamp: Date.now() });
    this.changesSource.next();
  }

  getSnapshot(): StatisticsSnapshot {
    return {
      actionCounts: Object.fromEntries(this.actionCounts),
      lifetimeGained: Object.fromEntries(this.lifetimeGained),
      majorUnlocks: this.majorUnlocks,
    };
  }

  restore(snapshot: StatisticsSnapshot | undefined): void {
    this.actionCounts = new Map(Object.entries(snapshot?.actionCounts ?? {}));
    this.lifetimeGained = new Map(Object.entries(snapshot?.lifetimeGained ?? {}));
    this.majorUnlocks = snapshot?.majorUnlocks ?? [];
    this.changesSource.next();
  }
}
