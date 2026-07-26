import { ChangeDetectorRef, Directive, EventEmitter, HostBinding, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';

/**
 * Fires immediately on press, then keeps firing on an interval for as long as the
 * pointer is held down — the "hold to autoclick" affordance. Uses Pointer Events so
 * mouse and touch are handled identically without separate listeners.
 *
 * Game 1 had hold-to-click with no visible affordance and players never discovered it
 * — pair this directive with an on-screen hint (see ButtonZoneComponent) rather than
 * relying on the interaction alone.
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
