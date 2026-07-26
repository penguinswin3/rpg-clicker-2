import { Directive, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core';

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

  private intervalId?: ReturnType<typeof setInterval>;

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
    this.appHoldToClick.emit();
    this.intervalId = setInterval(() => this.appHoldToClick.emit(), this.holdToClickIntervalMs);
  }

  private stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
