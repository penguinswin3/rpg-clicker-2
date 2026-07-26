import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Identifiers for every modal in the app (most are top-bar-launched; 'credits' opens
 *  from within the Options modal instead — see OptionsPanelComponent). */
export type ModalId = 'jacks' | 'crown' | 'stats' | 'options' | 'credits' | 'dev-tools';

/** Display title shown in the modal header for each modal id. */
export const MODAL_TITLES: Record<ModalId, string> = {
  jacks: 'JACKS',
  crown: 'THE CROWN',
  stats: 'STATISTICS',
  options: 'OPTIONS',
  credits: 'CREDITS',
  'dev-tools': 'DEV TOOLS',
};

/** Tracks which single modal (if any) is currently open. */
@Injectable({ providedIn: 'root' })
export class ModalService {
  private activeSource = new BehaviorSubject<ModalId | null>(null);
  readonly active$ = this.activeSource.asObservable();
  get active(): ModalId | null { return this.activeSource.getValue(); }

  open(id: ModalId): void { this.activeSource.next(id); }
  close(): void { this.activeSource.next(null); }
  toggle(id: ModalId): void {
    this.activeSource.next(this.activeSource.getValue() === id ? null : id);
  }
}
