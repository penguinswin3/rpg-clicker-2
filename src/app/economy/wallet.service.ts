import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface WalletChange {
  resourceId: string;
  /** 0 when this emission came from `restore()` rather than a real gain/spend — lets
   *  lifetime-gained tracking (StatisticsService) ignore save-load hydration. */
  delta: number;
}

export interface WalletSnapshot {
  amounts: Record<string, number>;
  unlockedIds: string[];
}

/**
 * Canonical store for resource amounts. A resource is "unlocked" the moment its amount
 * first goes above zero, and stays unlocked even if it's spent back down to zero.
 *
 * Performance note: `changes$` emits only the id of the resource that changed, not a
 * cloned snapshot of the whole wallet — consumers read the current amount imperatively
 * (`getAmount`) and re-render via `ChangeDetectorRef.markForCheck()`. This avoids
 * allocating/diffing a new object on every tick as the number of resources grows.
 */
@Injectable({ providedIn: 'root' })
export class WalletService {
  private amounts = new Map<string, number>();
  private unlockedIds = new Set<string>();

  private changesSource = new Subject<WalletChange>();
  readonly changes$ = this.changesSource.asObservable();

  getAmount(resourceId: string): number {
    return this.amounts.get(resourceId) ?? 0;
  }

  isUnlocked(resourceId: string): boolean {
    return this.unlockedIds.has(resourceId);
  }

  add(resourceId: string, delta: number): void {
    if (delta === 0) return;

    const next = this.getAmount(resourceId) + delta;
    this.amounts.set(resourceId, next);
    if (next > 0) {
      this.unlockedIds.add(resourceId);
    }
    this.changesSource.next({ resourceId, delta });
  }

  getSnapshot(): WalletSnapshot {
    return {
      amounts: Object.fromEntries(this.amounts),
      unlockedIds: [...this.unlockedIds],
    };
  }

  /** Replaces wallet state wholesale (save load) — does not affect lifetime-gained stats. */
  restore(snapshot: WalletSnapshot | undefined): void {
    this.amounts = new Map(Object.entries(snapshot?.amounts ?? {}));
    this.unlockedIds = new Set(snapshot?.unlockedIds ?? []);
    for (const resourceId of this.amounts.keys()) {
      this.changesSource.next({ resourceId, delta: 0 });
    }
  }
}
