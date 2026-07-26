import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Tracks "there's something new here" state for the shine/glow effect — a tab
 * (`tab:upgrades`, `tab:objectives`) or a character box (`character:ranger`) stays
 * marked until the player actually navigates to/selects it. Deliberately generic (a
 * flat set of string keys) so any future "new thing available" case reuses this
 * instead of each feature inventing its own boolean flag.
 */
@Injectable({ providedIn: 'root' })
export class AttentionService {
  private unseen = new Set<string>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  isUnseen(key: string): boolean {
    return this.unseen.has(key);
  }

  /** Idempotent — marking an already-unseen key again is a no-op. */
  markUnseen(key: string): void {
    if (this.unseen.has(key)) return;
    this.unseen.add(key);
    this.changesSource.next();
  }

  markSeen(key: string): void {
    if (!this.unseen.has(key)) return;
    this.unseen.delete(key);
    this.changesSource.next();
  }

  getSnapshot(): string[] {
    return [...this.unseen];
  }

  restore(keys: string[] | undefined): void {
    this.unseen = new Set(keys ?? []);
    this.changesSource.next();
  }
}
