import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

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

  private changesSource = new Subject<string>();
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
    this.changesSource.next(resourceId);
  }
}
