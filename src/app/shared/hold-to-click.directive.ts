import { ChangeDetectorRef, Directive, EventEmitter, HostBinding, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';

/**
 * Fires immediately on press, then keeps firing on an interval for as long as the
 * pointer is held down — the "hold to autoclick" affordance. Uses Pointer Events so
 * mouse and touch are handled identically without separate listeners.
 *
 * Enter/Space go through the exact same `start()`/`stop()` pair rather than a separate
 * single-shot `click` path, so a keyboard user gets genuine behavioural parity
 * (press-and-hold auto-repeat included) and there's only one implementation to keep
 * correct — see AGENTS.md §19 Accessibility.
 */
@Directive({
  selector: '[appHoldToClick]',
  standalone: true,
})
export class HoldToClickDirective implements OnDestroy {
  /** Time between repeats while held, in ms. Upgrades will lower this later. */
  @Input() holdToClickIntervalMs = 1000;

  @Output() appHoldToClick = new EventEmitter<void>();

  private cdr = inject(ChangeDetectorRef);
  private intervalId?: ReturnType<typeof setInterval>;

  // Flips on every fire (press + each repeat) so the host template can alternate between
  // two identically-defined "pulse" classes — a plain boolean toggled back to the same
  // value wouldn't restart a CSS animation that already finished, alternating classes does.
  private pulseState = false;

  @HostBinding('class.hold-pulse-a') get pulseA(): boolean { return this.pulseState; }
  @HostBinding('class.hold-pulse-b') get pulseB(): boolean { return !this.pulseState; }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.start();
  }

  @HostListener('pointerup') onPointerUp(): void { this.stop(); }
  @HostListener('pointerleave') onPointerLeave(): void { this.stop(); }
  @HostListener('pointercancel') onPointerCancel(): void { this.stop(); }

  /** Keyboard equivalent of pointerdown. `start()` is idempotent (see below), so the OS's
   *  own key auto-repeat firing `keydown` over and over while the key is held is harmless
   *  — the interval set up by the first one keeps running at the directive's own cadence
   *  rather than the OS's. `preventDefault()` both stops Space from scrolling the page and
   *  suppresses the native `click` the browser would synthesize on Enter/Space (which
   *  nothing listens for here anyway, but keeping it out avoids a future double-fire). */
  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.start();
  }

  @HostListener('keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    this.stop();
  }

  /** A key held down while focus moves away (or the element is disabled) would otherwise
   *  never see its `keyup` — blur stops the repeat the same way pointerleave does. */
  @HostListener('blur') onBlur(): void { this.stop(); }

  ngOnDestroy(): void {
    this.stop();
  }

  private start(): void {
    if (this.intervalId) return;
    this.fire();
    this.intervalId = setInterval(() => this.fire(), this.holdToClickIntervalMs);
  }

  private stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private fire(): void {
    this.pulseState = !this.pulseState;
    this.cdr.markForCheck();
    this.appHoldToClick.emit();
  }
}
