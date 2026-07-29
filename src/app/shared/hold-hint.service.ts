import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Tracks which hold-to-click actions the player has actually held (not just tapped) at
 * least once, so the "hold to repeat" hint (see `ButtonZoneComponent`) can retire itself
 * for good instead of reappearing on every reload. Keyed by the action's own id
 * (`CharacterActionConfig.id`) — a flat, sticky set of strings, the same shape
 * `AttentionService` uses, but a distinct concern: "a mechanic the player has already
 * discovered" isn't "something new to draw their eye to," so this stays its own service
 * rather than overloading `AttentionService`'s unseen/seen meaning.
 */
@Injectable({ providedIn: 'root' })
export class HoldHintService {
  private heldSource = new BehaviorSubject<Set<string>>(new Set());
  readonly changes$ = this.heldSource.asObservable();

  hasHeld(actionId: string): boolean {
    return this.heldSource.getValue().has(actionId);
  }

  /** Whether the player has ever held down *any* hold-to-click action. The "hold to
   *  repeat" hint is teaching a single mechanic, not a per-button one — once the player
   *  has learned it anywhere, it should stop showing everywhere, including on a button
   *  for an action/character they haven't personally held yet. */
  hasHeldAny(): boolean {
    return this.heldSource.getValue().size > 0;
  }

  /** Idempotent — marking an already-held action is a no-op. */
  markHeld(actionId: string): void {
    if (this.hasHeld(actionId)) return;
    const next = new Set(this.heldSource.getValue());
    next.add(actionId);
    this.heldSource.next(next);
  }

  getSnapshot(): string[] {
    return [...this.heldSource.getValue()];
  }

  restore(snapshot: string[] | undefined): void {
    this.heldSource.next(new Set(snapshot ?? []));
  }
}
