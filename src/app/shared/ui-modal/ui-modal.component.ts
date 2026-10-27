import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  AfterViewChecked,
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
export class UiModalComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previouslyFocused?: HTMLElement;

  /** The `title` the modal's content was last focused for — the change signal for "the
   *  projected content just swapped out from under us." `null` (never a real title) means
   *  "not focused yet," so the initial open goes through the same single code path.
   *
   *  `title` is the signal because app.component.html mounts exactly *one* `<app-ui-modal>`
   *  and swaps its projected content via `ngSwitch` (Options -> Credits, Options ->
   *  Confirm), so this component is never destroyed/recreated across those transitions —
   *  but every modal id has its own distinct `MODAL_TITLES` entry, so the title always
   *  changes when the content does. (Two modal ids sharing one title would skip the
   *  refocus — `MODAL_TITLES` has no duplicates today; keep it that way, or switch this
   *  signal to the modal id itself.) */
  private focusedForTitle: string | null = null;

  /** Static is fine — see ui-modal.component.html's comment: only one instance of this
   *  component is ever mounted at once (app.component.html gates it behind one *ngIf). */
  readonly titleId = 'modal-title';

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  /** Bound on `document`, not the host, deliberately: a keydown is delivered to
   *  `document.activeElement` and bubbles up from there, so a host-scoped listener only
   *  ever sees Tab while focus is *already* inside the modal — exactly the case that
   *  doesn't need rescuing. Listening at the document level is what lets `trapFocus`
   *  pull focus back in when it has escaped (see its comment). Safe because only one
   *  modal is ever mounted at a time (app.component.html gates it behind one *ngIf), and
   *  while it is open nothing behind the backdrop is meant to be reachable anyway —
   *  same reasoning as the `document:keydown.escape` listener above. */
  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: Event): void {
    this.trapFocus(event, false);
  }

  @HostListener('document:keydown.shift.tab', ['$event'])
  onShiftTab(event: Event): void {
    this.trapFocus(event, true);
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement;
  }

  /** Moves focus into the modal on open *and* every time its projected content is
   *  swapped underneath it (Options -> Credits, Options -> Reset-Save Confirm), which
   *  `ngAfterViewInit` structurally cannot do: this component isn't destroyed/recreated
   *  across those transitions, so that hook only ever ran once. Without this, the element
   *  that *was* focused (the "Credits"/"Reset Save" button) gets destroyed with the old
   *  content, focus falls back to `<body>`, and Tab walks straight out of a dialog that's
   *  telling assistive tech `aria-modal="true"`.
   *
   *  `AfterViewChecked` rather than `OnChanges` + `setTimeout` on purpose: by the time a
   *  child component's view hooks run, the parent's own template update (including the
   *  `ngSwitch` that creates/destroys the projected content) has already executed and the
   *  new DOM is attached — so the new content is queryable *synchronously* here, with no
   *  deferred-timer ordering to reason about and nothing async for a spec to have to
   *  `tick()` past. It also catches a statically-bound `title` (plain `title="..."`
   *  attribute, as in the specs), which never fires `ngOnChanges` at all. The
   *  `focusedForTitle` guard is what keeps this from re-stealing focus on every single
   *  change-detection cycle — it acts once per real content change. */
  ngAfterViewChecked(): void {
    if (this.title === this.focusedForTitle) return;
    this.focusedForTitle = this.title;
    this.focusFirst();
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus();
  }

  /** Keeps Tab from escaping the modal into the page behind the backdrop — wraps from
   *  the last focusable element back to the first (or, going backwards, the first back
   *  to the last) instead of letting the browser's default tab order take over.
   *
   *  The out-of-modal check comes first as defense-in-depth: the boundary comparisons
   *  below only match when focus is on a known focusable *inside* the panel, so anything
   *  that drops focus to `<body>` while the modal is open (content swapped out from under
   *  the focused element, focus-return to a since-removed trigger, a programmatic
   *  `blur()`) used to make Tab fall through to the browser's default order and leak into
   *  the page. Now the very next Tab recovers instead. */
  private trapFocus(event: Event, backwards: boolean): void {
    if (!this.host.nativeElement.contains(document.activeElement)) {
      event.preventDefault();
      this.focusFirst();
      return;
    }

    const focusable = this.focusableElements();
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

  private focusableElements(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  /** The one "focus this" rule, shared by open, content-swap, and focus-escape recovery:
   *  the first focusable element in the modal, falling back to the panel itself (which is
   *  `tabindex="-1"` precisely so it can hold focus when nothing else can). */
  private focusFirst(): void {
    const panel = this.host.nativeElement.querySelector<HTMLElement>('.modal-panel');
    (this.focusableElements()[0] ?? panel)?.focus();
  }
}
