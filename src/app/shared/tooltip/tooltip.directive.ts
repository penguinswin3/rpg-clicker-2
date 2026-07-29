import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewContainerRef,
  ComponentRef,
  HostListener,
  inject,
} from '@angular/core';
import { TooltipComponent } from './tooltip.component';
import { TooltipContent } from './tooltip-content';

/** Delay before a tooltip appears, in ms — long enough that just sweeping the pointer
 *  across the button zone doesn't spam a tooltip after every button, short enough that
 *  someone deliberately pausing on a button sees it promptly. Cosmetic-only UI pacing,
 *  not a game value, so it lives here rather than game-config.ts (same reasoning as
 *  ButtonZoneComponent's WAITING_DOT_INTERVAL_MS). */
const TOOLTIP_SHOW_DELAY_MS = 350;

/** Minimum gap kept between the tooltip box and the viewport edge / the trigger element,
 *  in px. */
const VIEWPORT_MARGIN_PX = 6;
const TRIGGER_GAP_PX = 8;

/**
 * Hover-triggered detail tooltip — `[appTooltip]="content"` on any element. Shows a
 * `TooltipComponent` positioned above (or, if there's no room, below) the host element
 * after a short delay, and tears it down immediately on pointer-leave/press or when the
 * host is destroyed. Content is a plain `TooltipContent` object built by the consumer
 * (see `ButtonZoneComponent`'s tooltip builders) — this directive only owns
 * show/hide/positioning, never the domain logic of what a button's numbers actually are.
 *
 * Deliberately not a shared singleton/overlay-service tooltip — each host gets its own
 * directive instance and its own `TooltipComponent`, torn down on hide rather than
 * reused, since this game only ever has a handful of buttons on screen at once and the
 * simplicity is worth more here than pooling.
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnChanges, OnDestroy {
  @Input('appTooltip') content?: TooltipContent;

  private host = inject(ElementRef<HTMLElement>);
  private vcr = inject(ViewContainerRef);

  private ref?: ComponentRef<TooltipComponent>;
  private showTimer?: ReturnType<typeof setTimeout>;

  @HostListener('pointerenter')
  onPointerEnter(): void {
    this.scheduleShow();
  }

  @HostListener('pointerleave')
  onPointerLeave(): void {
    this.hide();
  }

  // A tooltip lingering over an actively-held/clicked button is exactly the
  // "obtrusive" thing to avoid — clear it the instant a real interaction starts rather
  // than waiting for pointerleave (which, for a press-and-hold button, might not fire
  // until well after the player's attention has moved on).
  @HostListener('pointerdown')
  onPointerDown(): void {
    this.hide();
  }

  ngOnChanges(): void {
    // Content can change live (e.g. an upgrade purchased elsewhere changes a button's
    // yield) while the tooltip is already open — keep it in sync rather than showing
    // stale numbers until the next hover.
    if (this.ref) this.applyContent();
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private scheduleShow(): void {
    if (!this.content || this.content.rows.length === 0) return;
    this.clearTimer();
    this.showTimer = setTimeout(() => this.show(), TOOLTIP_SHOW_DELAY_MS);
  }

  private show(): void {
    if (this.ref) return;
    this.ref = this.vcr.createComponent(TooltipComponent);
    this.applyContent();
    // The box's own size (for centering/clamping) isn't known until its content has
    // actually rendered — force a synchronous render before measuring.
    this.ref.changeDetectorRef.detectChanges();
    this.position();
  }

  private applyContent(): void {
    if (!this.ref || !this.content) return;
    this.ref.instance.title = this.content.title;
    this.ref.instance.rows = this.content.rows;
  }

  private position(): void {
    if (!this.ref) return;
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    const tipEl = this.ref.location.nativeElement as HTMLElement;
    const tipRect = tipEl.getBoundingClientRect();

    let top = hostRect.top - tipRect.height - TRIGGER_GAP_PX;
    if (top < VIEWPORT_MARGIN_PX) {
      top = hostRect.bottom + TRIGGER_GAP_PX; // no room above — flip below instead
    }
    let left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
    left = Math.max(VIEWPORT_MARGIN_PX, Math.min(left, window.innerWidth - tipRect.width - VIEWPORT_MARGIN_PX));
    top = Math.max(VIEWPORT_MARGIN_PX, Math.min(top, window.innerHeight - tipRect.height - VIEWPORT_MARGIN_PX));

    tipEl.style.top = `${top}px`;
    tipEl.style.left = `${left}px`;
  }

  private hide(): void {
    this.clearTimer();
    this.ref?.destroy();
    this.ref = undefined;
  }

  private clearTimer(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = undefined;
    }
  }
}
