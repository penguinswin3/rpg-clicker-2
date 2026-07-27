import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmRequest {
  message: string;
  /** Defaults to 'Confirm' — override for a more specific verb (e.g. 'Delete'). */
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * In-app replacement for `window.confirm()` for any destructive action that needs a
 * "are you sure?" step — native confirm/alert dialogs are unreliable outside a plain
 * browser tab (blocked or auto-dismissed in embedded/automated contexts), so every
 * destructive action routes through this instead of calling `confirm()` directly.
 *
 * Pairs with `ModalService`'s `'confirm'` id and `ConfirmModalComponent` — a caller
 * sets the pending request here, then opens the modal (`modalService.open('confirm')`),
 * same "modal launched from within another" pattern Credits already uses from Options.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private requestSource = new BehaviorSubject<ConfirmRequest | null>(null);
  readonly request$ = this.requestSource.asObservable();
  get request(): ConfirmRequest | null {
    return this.requestSource.getValue();
  }

  ask(request: ConfirmRequest): void {
    this.requestSource.next(request);
  }

  /** Fires the pending request's action and clears it. No-op if nothing is pending. */
  confirm(): void {
    const request = this.request;
    this.requestSource.next(null);
    request?.onConfirm();
  }

  /** Clears the pending request without firing it. Idempotent — safe to call even if
   *  already cleared (e.g. `ConfirmModalComponent` calls this on teardown regardless of
   *  whether the player hit Cancel, Escape, the backdrop, or Confirm already ran). */
  cancel(): void {
    this.requestSource.next(null);
  }
}
