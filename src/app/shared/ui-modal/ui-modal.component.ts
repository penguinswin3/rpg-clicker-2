import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  AfterViewInit,
  OnDestroy,
  Output,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/** Every element type that can receive keyboard focus — used to find the focus trap's
 *  boundaries and the "focus this on open" target. Mirrors the standard focusable-element
 *  selector; keep in sync if a new focusable element type is ever projected into a modal. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Generic terminal-styled modal shell: dimmed backdrop + bordered panel with a
 * bracketed title bar. Reused by every top-bar modal (Jacks, Crown, Stats, Options,
 * Credits, Dev Tools) and Confirm — a real `role="dialog"`, a focus trap, and
 * focus-return-on-close live here once, so every one of those gets it for free.
 */
@Component({
  selector: 'app-ui-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-modal.component.html',
  styleUrl: './ui-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previouslyFocused?: HTMLElement;

  /** Static is fine — see ui-modal.component.html's comment: only one instance of this
   *  component is ever mounted at once (app.component.html gates it behind one *ngIf). */
  readonly titleId = 'modal-title';

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  @HostListener('keydown.tab', ['$event'])
  onTab(event: KeyboardEvent): void {
    this.trapFocus(event, false);
  }

  @HostListener('keydown.shift.tab', ['$event'])
  onShiftTab(event: KeyboardEvent): void {
    this.trapFocus(event, true);
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement;
  }

  ngAfterViewInit(): void {
    const firstFocusable = this.host.nativeElement.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    const panel = this.host.nativeElement.querySelector<HTMLElement>('.modal-panel');
    (firstFocusable ?? panel)?.focus();
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus();
  }

  /** Keeps Tab from escaping the modal into the page behind the backdrop — wraps from
   *  the last focusable element back to the first (or, going backwards, the first back
   *  to the last) instead of letting the browser's default tab order take over. */
  private trapFocus(event: KeyboardEvent, backwards: boolean): void {
    const focusable = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (backwards && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!backwards && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
