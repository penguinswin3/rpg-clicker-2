# Accessibility (Screen Reader / Keyboard) Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every interactive element in RPG Clicker 2 keyboard-operable and
correctly announced by a screen reader, and make that a permanent, automatically-checked
requirement rather than a one-time pass.

**Architecture:** Fix the two most-reused shared components first (`UiModalComponent`,
`TooltipDirective`) so the fix compounds across every modal/tooltip in the game. Add one
new shared live-region component that mirrors the Activity Log's already-existing
"noteworthy vs. routine" message levels, with zero new call sites in business logic.
Promote the handful of custom clickable `<div>`s to real `<button>` elements, matching
how every other interactive element in this app already works. Close with a permanent
`AGENTS.md` rule and an automated axe-core scan in e2e.

**Tech Stack:** Angular 17 (standalone components), Karma/Jasmine (unit), Playwright
(e2e), `@axe-core/playwright` (new dependency, added in Task 13).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-27-accessibility-retrofit-design.md` — read it
  first; this plan implements it task-by-task.
- No visual redesign — every change is additive (attributes, a tag swap, a hidden live
  region). Don't change colors, spacing, or the terminal/ASCII aesthetic.
- Every custom clickable element being promoted to `<button>` must keep its existing CSS
  class(es) unchanged — e2e/unit specs select by class, never by tag, so this is safe,
  but don't rename a class while touching its element.
- No `role="progressbar"` on fill bars and no live-announcement of high-frequency content
  (gold ticking, HP during combat, running timers) — see the spec's Non-goals. Fill bars
  get `aria-hidden="true"` instead (Task 10).
- `npm run test:unit` and `npm run test:e2e` (or `npm run test:all`) must stay green
  after every task — run the relevant one at the end of each task, not just once at the
  end of the whole plan.

---

### Task 1: `.sr-only` visually-hidden utility class

**Files:**
- Modify: `src/styles.scss`

**Interfaces:**
- Produces: a global `.sr-only` CSS class — any element with this class is removed from
  visual layout and painting but stays in the accessibility tree. Task 3's
  `LiveAnnouncerComponent` is the first consumer.

- [ ] **Step 1: Add the utility class**

Open `src/styles.scss` and add this block (placement doesn't matter — e.g. right after
the existing `button { user-select: none; }` rule near the top):

```scss
// Visually hides an element while keeping it in the accessibility tree — the standard
// "sr-only" pattern. Used by anything that needs to be announced to a screen reader
// without being part of the visible terminal-styled UI (see LiveAnnouncerComponent).
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: builds successfully, no SCSS errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles.scss
git commit -m "Add .sr-only visually-hidden utility class"
```

---

### Task 2: `UiModalComponent` — dialog semantics + focus trap + focus return

Every modal in the game (Jacks, Crown, Stats, Options, Credits, Dev Tools, Confirm)
mounts through this one component (`app.component.html`'s single
`*ngIf="modalService.active$ | async"` gate — only one instance ever exists at a time).

**Files:**
- Modify: `src/app/shared/ui-modal/ui-modal.component.ts`
- Modify: `src/app/shared/ui-modal/ui-modal.component.html`
- Modify: `src/app/shared/ui-modal/ui-modal.component.scss`
- Create: `src/app/shared/ui-modal/ui-modal.component.spec.ts`

**Interfaces:**
- Consumes: nothing new — same `@Input() title`, `@Output() closed` as before.
- Produces: nothing new is consumed by other tasks; this is a leaf fix.

- [ ] **Step 1: Write the failing spec**

Create `src/app/shared/ui-modal/ui-modal.component.spec.ts`:

```ts
import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiModalComponent } from './ui-modal.component';

@Component({
  standalone: true,
  imports: [CommonModule, UiModalComponent],
  template: `
    <button #trigger (click)="open = true">Open</button>
    <app-ui-modal *ngIf="open" title="Test" (closed)="open = false">
      <button class="first-action">First</button>
      <button class="second-action">Second</button>
    </app-ui-modal>
  `,
})
class HostComponent {
  open = false;
  @ViewChild('trigger') trigger!: ElementRef<HTMLButtonElement>;
}

describe('UiModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    // Focus-trap/focus-return assertions need the fixture attached to the live
    // document — document.activeElement is meaningless on a detached fixture.
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function openModal(): void {
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).focus();
    fixture.componentInstance.open = true;
    fixture.detectChanges();
  }

  it('renders dialog semantics: role, aria-modal, aria-labelledby pointing at the title', () => {
    openModal();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.modal-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const titleId = panel.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toContain('Test');
  });

  it('moves focus into the modal on open', () => {
    openModal();
    const firstFocusable = fixture.nativeElement.querySelector('.modal-close');
    expect(document.activeElement).toBe(firstFocusable);
  });

  it('returns focus to whatever triggered it once closed', () => {
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    openModal();
    expect(document.activeElement).not.toBe(trigger);

    fixture.componentInstance.open = false;
    fixture.detectChanges();

    expect(document.activeElement).toBe(trigger);
  });

  it('wraps Tab from the last focusable element back to the first', () => {
    openModal();
    const focusables: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.modal-close, .first-action, .second-action')
    );
    const last = focusables[focusables.length - 1];
    last.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('app-ui-modal').dispatchEvent(event);

    expect(document.activeElement).toBe(focusables[0]);
    expect(event.defaultPrevented).toBeTrue();
  });

  it('wraps Shift+Tab from the first focusable element back to the last', () => {
    openModal();
    const focusables: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.modal-close, .first-action, .second-action')
    );
    focusables[0].focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('app-ui-modal').dispatchEvent(event);

    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    expect(event.defaultPrevented).toBeTrue();
  });

  it('the close control is a real button labelled "Close"', () => {
    openModal();
    const close: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-close');
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('aria-label')).toBe('Close');
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npm run test:unit`
Expected: `UiModalComponent` spec fails — `role`/`aria-modal`/`aria-labelledby` are
`null`, focus assertions fail, `.modal-close` is a `<span>` not a `<button>`.

- [ ] **Step 3: Update `ui-modal.component.html`**

Replace the full contents of `src/app/shared/ui-modal/ui-modal.component.html` with:

```html
<div class="modal-backdrop" (click)="onBackdropClick()">
  <div
    class="modal-panel"
    role="dialog"
    aria-modal="true"
    [attr.aria-labelledby]="titleId"
    tabindex="-1"
    (click)="$event.stopPropagation()">
    <div class="modal-header">
      <span class="modal-title" [id]="titleId">[ {{ title }} ]</span>
      <button type="button" class="modal-close" aria-label="Close" (click)="closed.emit()">[x]</button>
    </div>
    <div class="modal-body">
      <ng-content></ng-content>
    </div>
  </div>
</div>
```

(`titleId` is a static per-instance string set in Step 4 — static is fine since only one
`UiModalComponent` is ever mounted at a time, per `app.component.html`'s single `*ngIf`.)

- [ ] **Step 4: Update `ui-modal.component.ts`**

Replace the full contents of `src/app/shared/ui-modal/ui-modal.component.ts` with:

```ts
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

  private host = inject(ElementRef<HTMLElement>);
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
```

- [ ] **Step 5: Update `ui-modal.component.scss`**

In `src/app/shared/ui-modal/ui-modal.component.scss`, replace the `.modal-close` rule and
add a focus-outline reset on `.modal-panel`:

```scss
.modal-panel {
  min-width: 320px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #000;
  border: 2px solid #fff;

  // The panel itself is only ever a programmatic focus landing spot when nothing
  // projected in is focusable (e.g. Jacks/Crown, which only show an empty state) — no
  // visible ring needed for an element the player never tabs to directly.
  &:focus {
    outline: none;
  }
}
```

(Leave every other existing rule in the file untouched — only `.modal-close` and
`.modal-panel` change.) Update `.modal-close`:

```scss
.modal-close {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: #bbb;
  cursor: pointer;
  font-size: 12px;
  user-select: none;

  &:hover { color: #fff; }
}
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `npm run test:unit`
Expected: all `UiModalComponent` specs PASS.

- [ ] **Step 7: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green — every existing modal interaction (Dev Tools, Options,
Confirm) goes through this same component and must keep working. Pay particular
attention to any e2e test that clicks `.modal-close` by old structure — it's selected by
class everywhere (verified during design), so this should be a no-op change for them.

- [ ] **Step 8: Commit**

```bash
git add src/app/shared/ui-modal/
git commit -m "UiModalComponent: real dialog semantics, focus trap, focus return"
```

---

### Task 3: Live-region announcer for rare/discrete events

A new shared component that mirrors the Activity Log's own "noteworthy vs. routine"
message levels — any message logged above `'default'` gets announced to a screen reader,
with zero new call sites in any business-logic service.

**Files:**
- Create: `src/app/shared/live-announcer/live-announcer.component.ts`
- Create: `src/app/shared/live-announcer/live-announcer.component.html`
- Create: `src/app/shared/live-announcer/live-announcer.component.spec.ts`
- Modify: `src/app/app.component.ts`
- Modify: `src/app/app.component.html`

**Interfaces:**
- Consumes: `ActivityLogService.messages$` (`Observable<LogMessage[]>`,
  `LogMessage = { id: number; timestamp: string; text: string; type?: LogFilterType }`,
  `LogFilterType = 'default' | 'success' | 'warn' | 'error' | 'rare'` — both already
  exist in `src/app/activity-log/activity-log.service.ts`).
- Produces: nothing consumed by later tasks — a leaf addition.

- [ ] **Step 1: Write the failing spec**

Create `src/app/shared/live-announcer/live-announcer.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveAnnouncerComponent } from './live-announcer.component';
import { ActivityLogService } from '../../activity-log/activity-log.service';

describe('LiveAnnouncerComponent', () => {
  let fixture: ComponentFixture<LiveAnnouncerComponent>;
  let logService: ActivityLogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LiveAnnouncerComponent] });
    fixture = TestBed.createComponent(LiveAnnouncerComponent);
    logService = TestBed.inject(ActivityLogService);
  });

  function region(): HTMLElement {
    return fixture.nativeElement.querySelector('[aria-live]');
  }

  it('renders a polite, atomic, visually-hidden live region', () => {
    fixture.detectChanges();
    const el = region();
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('aria-atomic')).toBe('true');
    expect(el.classList.contains('sr-only')).toBeTrue();
  });

  it('does not announce a routine (\'default\'-level) message', () => {
    fixture.detectChanges();
    logService.log('You put in a hard day\'s work and earn some gold.', 'default');
    fixture.detectChanges();

    expect(region().textContent?.trim()).toBe('');
  });

  it('announces a non-default message, with currency tokens stripped to plain text', () => {
    fixture.detectChanges();
    logService.log('Objective claimed: {{gold|+50 G}}', 'success');
    fixture.detectChanges();

    expect(region().textContent?.trim()).toBe('Objective claimed: +50 G');
  });

  it('never re-announces messages that already existed before the component mounted', () => {
    // Simulates a save that restored with existing log history before this component
    // ever subscribed — e.g. after a page reload.
    logService.log('An old noteworthy thing happened.', 'warn');

    fixture.detectChanges(); // first subscription tick sees the pre-existing history

    expect(region().textContent?.trim()).toBe('');
  });

  it('announces each new non-default message as it arrives', () => {
    fixture.detectChanges();
    logService.log('First.', 'error');
    fixture.detectChanges();
    expect(region().textContent?.trim()).toBe('First.');

    logService.log('Second.', 'rare');
    fixture.detectChanges();
    expect(region().textContent?.trim()).toBe('Second.');
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npm run test:unit`
Expected: fails with "Cannot find module './live-announcer.component'" (the component
doesn't exist yet).

- [ ] **Step 3: Create `live-announcer.component.html`**

```html
<div class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
```

- [ ] **Step 4: Create `live-announcer.component.ts`**

```ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivityLogService, LogMessage } from '../../activity-log/activity-log.service';

/** Matches the same {{currencyId|displayText}} tokens ActivityLogComponent.parseLogText
 *  colors — here they're just stripped down to the plain displayText, since a screen
 *  reader announcement has no concept of inline color. */
const CUR_TOKEN = /\{\{[\w-]+\|([^}]+)\}\}/g;

/**
 * Visually-hidden aria-live region that announces rare/discrete game events to a screen
 * reader — objective claims, character unlocks (which happen via an objective claim),
 * combat outcomes, errors, rare payout doubles. Deliberately reuses ActivityLogService's
 * own message levels rather than adding a second announcement mechanism: anything
 * already logged above 'default' (see AGENTS.md's "Game action log messages") is, by
 * this codebase's own convention, already "noteworthy, not routine" — exactly what
 * should interrupt a screen reader with a polite announcement. High-frequency content
 * (gold ticking, HP during combat, running timers) is never logged above 'default' in
 * the first place, so it's excluded for free, no extra filtering needed here.
 */
@Component({
  selector: 'app-live-announcer',
  standalone: true,
  templateUrl: './live-announcer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveAnnouncerComponent implements OnInit, OnDestroy {
  private logService = inject(ActivityLogService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  private lastSeenId = -1;
  private sawInitialBatch = false;

  announcement = '';

  ngOnInit(): void {
    this.sub.add(this.logService.messages$.subscribe(msgs => this.onMessages(msgs)));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private onMessages(msgs: LogMessage[]): void {
    if (!this.sawInitialBatch) {
      // The first emission is whatever history already existed (e.g. restored on boot)
      // — never announce it, only genuinely new messages from here on.
      this.sawInitialBatch = true;
      this.lastSeenId = msgs.length > 0 ? msgs[msgs.length - 1].id : -1;
      return;
    }

    const newOnes = msgs.filter(m => m.id > this.lastSeenId && m.type && m.type !== 'default');
    if (msgs.length > 0) this.lastSeenId = msgs[msgs.length - 1].id;
    if (newOnes.length === 0) return;

    const latest = newOnes[newOnes.length - 1];
    this.announcement = latest.text.replace(CUR_TOKEN, '$1');
    this.cdr.markForCheck();
  }
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `npm run test:unit`
Expected: all `LiveAnnouncerComponent` specs PASS.

- [ ] **Step 6: Mount it in `app.component`**

In `src/app/app.component.ts`, add the import and register it:

```ts
import { LiveAnnouncerComponent } from './shared/live-announcer/live-announcer.component';
```

Add `LiveAnnouncerComponent` to the `imports` array (anywhere in the list — e.g. right
after `ActivityLogComponent`).

In `src/app/app.component.html`, add it once, anywhere outside `.main-layout` (e.g. right
after `<app-activity-log></app-activity-log>`):

```html
<app-live-announcer></app-live-announcer>
```

- [ ] **Step 7: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green.

- [ ] **Step 8: Commit**

```bash
git add src/app/shared/live-announcer/ src/app/app.component.ts src/app/app.component.html
git commit -m "Add LiveAnnouncerComponent — screen-reader announcements for rare/discrete events"
```

---

### Task 4: `TooltipDirective` — keyboard parity

Today the directive only listens for pointer events, so a keyboard user tabbing to a
button gets no detail at all.

**Files:**
- Modify: `src/app/shared/tooltip/tooltip.directive.ts`
- Modify: `src/app/shared/tooltip/tooltip.component.ts`
- Modify: `src/app/shared/tooltip/tooltip.component.html`
- Modify: `src/app/shared/tooltip/tooltip.directive.spec.ts`

**Interfaces:**
- Produces: no change to `[appTooltip]="content"` usage anywhere — every existing call
  site (Button Zone, Inventory Panel, Blacksmith Forge) keeps working unchanged.

- [ ] **Step 1: Add failing specs to `tooltip.directive.spec.ts`**

Add these two `it` blocks inside the existing `describe('TooltipDirective', ...)` block
in `src/app/shared/tooltip/tooltip.directive.spec.ts` (after the existing
`'does not show a tooltip immediately on pointerenter'` test, same file, same
`beforeEach`/`afterEach`/`tooltipBox()` helper already in the file):

```ts
  it('shows the tooltip on focus, the same way pointerenter does', fakeAsync(() => {
    button.dispatchEvent(new Event('focus'));
    tick(350);
    fixture.detectChanges();

    expect(tooltipBox()).not.toBeNull();
  }));

  it('hides on blur', fakeAsync(() => {
    button.dispatchEvent(new Event('focus'));
    tick(350);
    fixture.detectChanges();
    expect(tooltipBox()).not.toBeNull();

    button.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(tooltipBox()).toBeNull();
  }));

  it('sets aria-describedby on the host pointing at the tooltip while shown, and removes it on hide', fakeAsync(() => {
    expect(button.getAttribute('aria-describedby')).toBeNull();

    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();

    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBe(tooltipBox());

    button.dispatchEvent(new Event('pointerleave'));
    fixture.detectChanges();
    expect(button.getAttribute('aria-describedby')).toBeNull();
  }));
```

- [ ] **Step 2: Run the specs to verify they fail**

Run: `npm run test:unit`
Expected: the three new `TooltipDirective` specs FAIL (no focus/blur handling, no
`aria-describedby` wiring yet).

- [ ] **Step 3: Add an `id` input to `TooltipComponent`**

In `src/app/shared/tooltip/tooltip.component.ts`, add an `id` field next to the existing
`title`/`rows` fields:

```ts
export class TooltipComponent {
  id = '';
  title?: string;
  rows: TooltipRow[] = [];
}
```

In `src/app/shared/tooltip/tooltip.component.html`, bind it on the root element:

```html
<div class="tooltip-box" role="tooltip" [id]="id">
```

(Only that one line changes — the rest of the template is untouched.)

- [ ] **Step 4: Add focus/blur + `aria-describedby` to `tooltip.directive.ts`**

In `src/app/shared/tooltip/tooltip.directive.ts`, add a module-level id counter above the
class:

```ts
let tooltipIdCounter = 0;
```

Add two new `@HostListener`s next to the existing `onPointerEnter`/`onPointerLeave`:

```ts
  @HostListener('focus')
  onFocus(): void {
    this.scheduleShow();
  }

  @HostListener('blur')
  onBlur(): void {
    this.hide();
  }
```

Add a readonly id field (next to `private ref?: ...`):

```ts
  private readonly tooltipId = `tooltip-${tooltipIdCounter++}`;
```

In `show()`, set the id and the host's `aria-describedby` right after creating the
component ref:

```ts
  private show(): void {
    if (this.ref) return;
    this.ref = this.vcr.createComponent(TooltipComponent);
    this.ref.instance.id = this.tooltipId;
    this.host.nativeElement.setAttribute('aria-describedby', this.tooltipId);
    this.applyContent();
    // The box's own size (for centering/clamping) isn't known until its content has
    // actually rendered — force a synchronous render before measuring.
    this.ref.changeDetectorRef.detectChanges();
    this.position();
  }
```

In `hide()`, remove the attribute:

```ts
  private hide(): void {
    this.clearTimer();
    this.ref?.destroy();
    this.ref = undefined;
    this.host.nativeElement.removeAttribute('aria-describedby');
  }
```

- [ ] **Step 5: Run the specs to verify they pass**

Run: `npm run test:unit`
Expected: all `TooltipDirective` specs PASS, including the three new ones.

- [ ] **Step 6: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green, including `e2e/tooltip.spec.ts` and
`InventoryPanelComponent`'s tooltip spec.

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/tooltip/
git commit -m "TooltipDirective: show/hide on focus/blur, wire aria-describedby"
```

---

### Task 5: Party Vault — expandable rows become real buttons

**Files:**
- Modify: `src/app/party-vault/party-vault.component.html`
- Modify: `src/app/party-vault/party-vault.component.scss`

**Interfaces:** none — presentational only, `PartyVaultComponent`'s `.ts` is unchanged.

- [ ] **Step 1: Update `party-vault.component.html`**

Replace the `vault-entry` block (everything from `<div class="vault-entry" ...>` to its
closing `</div>`) with:

```html
    <div class="vault-entry" *ngFor="let r of filteredResources">
      <button
        *ngIf="r.sources.length > 0; else staticRow"
        type="button"
        class="vault-row expandable"
        [attr.aria-expanded]="r.expanded"
        (click)="toggleExpanded(r.id)">
        <ng-container *ngTemplateOutlet="rowContent; context: { r: r }"></ng-container>
      </button>
      <ng-template #staticRow>
        <div class="vault-row">
          <ng-container *ngTemplateOutlet="rowContent; context: { r: r }"></ng-container>
        </div>
      </ng-template>

      <ng-template #rowContent let-r="r">
        <span class="vault-symbol" [style.borderColor]="r.color" [style.color]="r.color">{{ r.symbol }}</span>
        <div class="vault-info">
          <div class="vault-name-line" [style.color]="r.color">{{ r.name }}</div>
          <div class="vault-amount-line">
            <span class="vault-amount">{{ formatAmount(r.amount) }}</span>
            <span
              class="vault-rate"
              [class.negative]="r.ratePerSecond < 0"
              [class.zero]="r.ratePerSecond === 0">
              {{ formatRate(r.ratePerSecond) }}
            </span>
          </div>
        </div>
      </ng-template>

      <div class="vault-sources" *ngIf="r.expanded && r.sources.length > 0">
        <div class="source-row" *ngFor="let s of r.sources">
          <span class="source-label">{{ s.label }}</span>
          <span
            class="source-rate"
            [class.negative]="s.ratePerSecond < 0"
            [class.zero]="s.ratePerSecond === 0">
            {{ formatRate(s.ratePerSecond) }}
          </span>
        </div>
      </div>
    </div>
```

(A resource with no sources never had anything to expand — rendering it as a plain,
non-focusable `<div>` instead of a `<button>` avoids a pointless keyboard tab stop that
does nothing, same reasoning as why it never had `.expandable`'s `cursor: pointer`
before.)

- [ ] **Step 2: Reset button chrome in `party-vault.component.scss`**

In `src/app/party-vault/party-vault.component.scss`, update the `.vault-row` rule to add
the browser-default-button resets (everything else about the rule stays the same):

```scss
.vault-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border: 1px solid #222;
  width: 100%;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;

  &.expandable {
    cursor: pointer;
    user-select: none;

    &:hover { border-color: #555; }
  }
}
```

- [ ] **Step 3: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green — `e2e/dev-tools.spec.ts` locates `.vault-row` by class
and text, unaffected by the tag change.

- [ ] **Step 4: Manual check**

Run `npm start`, open the app, grant some currency with sources (e.g. via Dev Tools),
confirm: clicking an expandable row still expands/collapses it; Tab reaches it and
pressing Enter/Space also expands/collapses it; a resource with no sources is not a tab
stop.

- [ ] **Step 5: Commit**

```bash
git add src/app/party-vault/
git commit -m "Party Vault: expandable rows become real buttons"
```

---

### Task 6: Activity Log — collapse header becomes a real button

**Files:**
- Modify: `src/app/activity-log/activity-log.component.html`
- Modify: `src/app/activity-log/activity-log.component.scss`

**Interfaces:** none — presentational only.

- [ ] **Step 1: Update `activity-log.component.html`**

Replace the `.log-header` div with a button:

```html
  <button type="button" class="log-header" [attr.aria-expanded]="!minimized" (click)="toggle()">
    <span class="log-title">[ ACTIVITY LOG ]</span>
    <span class="log-toggle" aria-hidden="true">{{ minimized ? '[+]' : '[-]' }}</span>
  </button>
```

(The bracket glyph is purely decorative once the button itself carries `aria-expanded` —
`.log-title`'s own text is a perfectly clear accessible name on its own, so no extra
`aria-label` is needed.)

- [ ] **Step 2: Reset button chrome in `activity-log.component.scss`**

Update the `.log-header` rule:

```scss
.log-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 4px 12px;
  background: #111;
  border-bottom: 1px solid #333;
  cursor: pointer;
  user-select: none;
  width: 100%;
  border: none;
  border-bottom: 1px solid #333;
  font: inherit;
  color: inherit;
  text-align: left;

  &:hover {
    background: #1a1a1a;
  }
}
```

(Two `border-bottom` declarations above is deliberate and harmless — `border: none`
resets every edge first, then `border-bottom` re-adds just the one this app actually
wants, same ordering trick already implicit in how a real `<button>`'s UA border gets
overridden elsewhere in this codebase.)

- [ ] **Step 3: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green.

- [ ] **Step 4: Manual check**

Run `npm start`, confirm the log header is reachable by Tab, and Enter/Space toggles
collapse/expand, matching the existing click behavior.

- [ ] **Step 5: Commit**

```bash
git add src/app/activity-log/
git commit -m "Activity Log: collapse header becomes a real button"
```

---

### Task 7: Options — setting toggles become real switch buttons

**Files:**
- Modify: `src/app/options/options-panel.component.html`
- Modify: `src/app/options/options-panel.component.scss`

**Interfaces:** none — presentational only, `OptionsPanelComponent.toggle(key)` is
unchanged.

- [ ] **Step 1: Update `options-panel.component.html`**

Replace the `.toggle-row` block:

```html
    <button
      type="button"
      class="toggle-row"
      role="switch"
      *ngFor="let opt of toggles"
      [attr.aria-checked]="settings[opt.key]"
      (click)="toggle(opt.key)">
      <span class="toggle-box" [class.on]="settings[opt.key]" aria-hidden="true">{{ settings[opt.key] ? 'X' : ' ' }}</span>
      <span class="toggle-label">{{ opt.label }}</span>
    </button>
```

(`.toggle-box`'s glyph is redundant with `aria-checked` once the button carries it, so it
gets `aria-hidden="true"` — `.toggle-label`'s text is the button's accessible name.)

- [ ] **Step 2: Reset button chrome in `options-panel.component.scss`**

Update the `.toggle-row` rule:

```scss
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #bbb;
  user-select: none;
  width: 100%;
  background: none;
  border: none;
  font: inherit;
  text-align: left;

  &:hover { color: #fff; }
}
```

- [ ] **Step 3: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green.

- [ ] **Step 4: Manual check**

Run `npm start`, open Options, confirm each toggle is reachable by Tab and
Enter/Space flips it, matching the existing click behavior.

- [ ] **Step 5: Commit**

```bash
git add src/app/options/
git commit -m "Options: setting toggles become real switch buttons"
```

---

### Task 8: Objectives — rows become real buttons

**Files:**
- Modify: `src/app/objectives/objectives-panel.component.html`
- Modify: `src/app/objectives/objectives-panel.component.scss`

**Interfaces:** none — presentational only, `ObjectivesPanelComponent.claim(o)` already
no-ops when `!o.claimable`, so the button is never disabled — an in-progress or
completed row stays focusable and readable (its progress/DONE text is real content a
screen-reader user should be able to reach), activating it is simply a no-op in those
states, same as a mouse click today.

- [ ] **Step 1: Update `objectives-panel.component.html`**

Replace the full contents of `src/app/objectives/objectives-panel.component.html`:

```html
<div class="objectives-panel">
  <app-empty-state *ngIf="objectives.length === 0" message="No objectives available"></app-empty-state>

  <button
    type="button"
    class="objective-row"
    *ngFor="let o of objectives"
    [class.completed]="o.completed"
    [class.claimable]="o.claimable"
    [class.flashing]="isFlashing(o)"
    (click)="claim(o)">
    <div
      class="objective-fill"
      *ngIf="!o.completed"
      aria-hidden="true"
      [style.width.%]="progressPercent(o)"
      [style.background]="fillColor(o)"></div>
    <div class="objective-desc">
      <ng-container *ngIf="isResourceObjective(o); else countObjective">
        Obtain
        <span [style.color]="resourceColor(objectiveResourceId(o)!)">
          {{ o.target }} {{ resourceSymbol(objectiveResourceId(o)!) }}
        </span>
      </ng-container>
      <ng-template #countObjective>{{ objectiveVerb(o) }} {{ o.target }} times</ng-template>
    </div>
    <div class="objective-status">
      <span *ngIf="!o.completed && !o.claimable" class="objective-progress">
        {{ formatAmount(o.current) }}/{{ formatAmount(o.target) }}
      </span>
      <span *ngIf="o.claimable" class="objective-claim">CLAIM</span>
      <span *ngIf="o.completed" class="objective-done">DONE</span>
    </div>
  </button>
</div>
```

(Only two things changed from the original: the root element is `<button type="button">`
instead of `<div (click)="claim(o)">`, and `.objective-fill` gained
`aria-hidden="true"` — it's a decorative reinforcement of the exact same information the
adjacent `.objective-progress` text already states.)

- [ ] **Step 2: Reset button chrome in `objectives-panel.component.scss`**

Update the `.objective-row` rule:

```scss
.objective-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
  border: 1px solid #222;
  overflow: hidden;
  transition: opacity 0.15s;
  width: 100%;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: default;

  &.completed {
    font-size: 12px;
    padding: 4px 6px;
    border-color: #1a1a1a;

    .objective-desc,
    .objective-desc span {
      color: #555 !important;
    }
  }

  // Target reached, reward not yet collected — an explicit "click me" affordance rather
  // than the reward just silently firing once the number crosses the threshold.
  &.claimable {
    cursor: pointer;
    border-color: #ffd700;

    &:hover {
      background: #1a1a0a;
    }
  }

  // Plays once the moment an objective flips to completed (see
  // ObjectivesPanelComponent.detectNewlyCompleted) — a brief highlight so a claim that
  // just happened is obvious even if the player's attention was elsewhere.
  &.flashing {
    animation: objective-flash 1s ease-out;
  }
}
```

(Only the four new properties — `width`, `background`, `font`, `color`, `text-align`,
`cursor: default` as the base state — are added; every existing selector/rule is
unchanged. `cursor: default` on the base state, overridden back to `pointer` by
`&.claimable`, matches the pre-existing visual behavior exactly — non-claimable rows
never looked clickable before either.)

- [ ] **Step 3: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green — `claimAllReadyObjectives` in `e2e/helpers.ts` selects
`.objective-row.claimable` by class and calls `.click()`, unaffected by the tag change.

- [ ] **Step 4: Manual check**

Run `npm start`, confirm an unclaimed/in-progress objective row is reachable by Tab (and
does nothing on Enter/Space), and a claimable row's Enter/Space claims it the same as a
click.

- [ ] **Step 5: Commit**

```bash
git add src/app/objectives/
git commit -m "Objectives: rows become real buttons"
```

---

### Task 9: Equipment + Inventory panels — slots become real buttons (and fix a real keyboard bug)

Today `.equipment-slot`/`.inventory-slot` are plain `<div>`s with `(click)` — the only
thing that currently prevents interacting with them while `disabled` is the parent's CSS
`pointer-events: none`, which blocks *mouse* clicks but was never a keyboard concern
because a `<div>` was never focusable in the first place. Converting to `<button>`
without also setting the real `disabled` attribute would let a keyboard user Tab to a
slot and press Enter to equip/unequip gear *during combat* — breaking the
"gear-locked-during-combat" invariant in `AGENTS.md`. Binding `[disabled]="disabled"`
on each button fixes this at the same time as the accessibility conversion.

**Files:**
- Modify: `src/app/fighter-combat/equipment-panel/equipment-panel.component.html`
- Modify: `src/app/fighter-combat/equipment-panel/equipment-panel.component.scss`
- Modify: `src/app/fighter-combat/equipment-panel/equipment-panel.component.spec.ts`
- Modify: `src/app/fighter-combat/inventory-panel/inventory-panel.component.html`
- Modify: `src/app/fighter-combat/inventory-panel/inventory-panel.component.scss`
- Modify: `src/app/fighter-combat/inventory-panel/inventory-panel.component.ts`
- Modify: `src/app/fighter-combat/inventory-panel/inventory-panel.component.spec.ts`

**Interfaces:**
- Produces: `InventoryPanelComponent` gains a new public method
  `itemLabel(id: string): string` (returns `getEquipmentFlavor(id).label`, same lookup
  `tooltip()` already does) for the new `aria-label`.

- [ ] **Step 1: Add failing specs**

In `src/app/fighter-combat/equipment-panel/equipment-panel.component.spec.ts`, replace
the existing `'does nothing when disabled'` test with one that also checks the real
`disabled` attribute (this is the keyboard-bypass regression test):

```ts
  it('is a real disabled button when disabled — not just click-guarded', () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    const slots = fixture.nativeElement.querySelectorAll('.equipment-slot');
    const ringSlot = slots[5] as HTMLButtonElement;
    expect(ringSlot.disabled).toBeTrue();

    ringSlot.click();
    expect(equipment.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
  });
```

In `src/app/fighter-combat/inventory-panel/inventory-panel.component.spec.ts`, replace
the existing `'does nothing when disabled'` test the same way, and add an `aria-label`
test:

```ts
  it('is a real disabled button when disabled — not just click-guarded', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    const slot = fixture.nativeElement.querySelector('.inventory-slot') as HTMLButtonElement;
    expect(slot.disabled).toBeTrue();

    slot.click();
    expect(equipment.getEquippedItemId('ring-1')).toBeUndefined();
  });

  it('has an aria-label naming the item, since the slot only shows a symbol glyph', () => {
    equipment.addToInventory('ring-swift-strike', 2);
    fixture.detectChanges();

    const slot: HTMLElement = fixture.nativeElement.querySelector('.inventory-slot');
    expect(slot.getAttribute('aria-label')).toBe('Ring of Swift Strikes');
  });
```

- [ ] **Step 2: Run the specs to verify they fail**

Run: `npm run test:unit`
Expected: the new/changed specs in both files FAIL (`.disabled` is `undefined` on a
`<div>`, `aria-label` is `null`).

- [ ] **Step 3: Update `equipment-panel.component.html`**

```html
<!-- src/app/fighter-combat/equipment-panel/equipment-panel.component.html -->
<div class="equipment-panel" [class.disabled]="disabled">
  <div class="zone-header">[ EQUIPMENT ]</div>
  <button
    type="button"
    class="equipment-slot"
    *ngFor="let slot of slots"
    [disabled]="disabled"
    (click)="unequip(slot.id)">
    <div class="equipment-slot-label">{{ slot.label }}</div>
    <div
      class="equipment-slot-item"
      *ngIf="equippedItemId(slot.id) as itemId; else emptySlot"
      [style.color]="rarityColor(itemId)">
      {{ label(itemId) }}
    </div>
    <ng-template #emptySlot>
      <div class="equipment-slot-empty">-- empty --</div>
    </ng-template>
  </button>

</div>
```

- [ ] **Step 4: Reset button chrome in `equipment-panel.component.scss`**

Update the `.equipment-slot` rule:

```scss
.equipment-slot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid #333;
  padding: 4px 6px;
  cursor: pointer;
  user-select: none;
  width: 100%;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;

  &:disabled {
    cursor: default;
  }
}
```

- [ ] **Step 5: Update `inventory-panel.component.ts`**

Add an `itemLabel` method next to the existing `symbol`/`rarityColor` methods:

```ts
  itemLabel(id: string): string {
    return getEquipmentFlavor(id).label;
  }
```

(`getEquipmentFlavor` is already imported in this file for `symbol()`.)

- [ ] **Step 6: Update `inventory-panel.component.html`**

```html
<!-- src/app/fighter-combat/inventory-panel/inventory-panel.component.html -->
<div class="inventory-panel" [class.disabled]="disabled">
  <div class="zone-header">[ INVENTORY ]</div>
  <app-empty-state *ngIf="entries.length === 0" message="Bag is empty" [compact]="true"></app-empty-state>

  <div class="inventory-grid" *ngIf="entries.length > 0">
    <button
      type="button"
      class="inventory-slot"
      *ngFor="let entry of entries; trackBy: trackByItemId"
      [style.color]="rarityColor(entry.config.rarity)"
      [style.borderColor]="rarityColor(entry.config.rarity)"
      [appTooltip]="tooltip(entry)"
      [disabled]="disabled"
      [attr.aria-label]="itemLabel(entry.config.id)"
      (click)="equip(entry.config.id)">
      {{ symbol(entry.config.id) }}
    </button>
  </div>
</div>
```

- [ ] **Step 7: Reset button chrome in `inventory-panel.component.scss`**

Update the `.inventory-slot` rule:

```scss
.inventory-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #333;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  background: none;
  font-family: inherit;

  &:disabled {
    cursor: default;
  }
}
```

- [ ] **Step 8: Run the specs to verify they pass**

Run: `npm run test:unit`
Expected: all `EquipmentPanelComponent` and `InventoryPanelComponent` specs PASS.

- [ ] **Step 9: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green — `e2e/dev-tools.spec.ts`'s "Give Sword" test hovers
`.inventory-slot` and reads the tooltip; `e2e/fighter-combat.spec.ts` checks
`app-inventory-panel`/`app-equipment-panel` visibility by component selector — neither
depends on the tag.

- [ ] **Step 10: Manual check**

Run `npm start`, unlock minigames + Fighter Combat, confirm: an inventory slot is
reachable by Tab and Enter/Space equips it; during an active fight (gear locked), Tab
still reaches the slots but Enter/Space does nothing (this is the keyboard-bypass fix —
verify it, don't just assume it from the unit test).

- [ ] **Step 11: Commit**

```bash
git add src/app/fighter-combat/equipment-panel/ src/app/fighter-combat/inventory-panel/
git commit -m "Equipment/Inventory panels: slots become real buttons, fix keyboard bypass of combat gear-lock"
```

---

### Task 10: Decorative content sweep — `aria-hidden` on ASCII art and fill bars

Every fill bar in the game is a decorative visual reinforcement of information that
already exists as real adjacent text, and the combat ASCII art is decorative next to
real name/HP text — both should be invisible to a screen reader rather than described as
empty/meaningless elements. (`.objective-fill` was already handled inline in Task 8.)

**Files:**
- Modify: `src/app/game-area/button-zone/button-zone.component.html`
- Modify: `src/app/fighter-combat/combatant-display/combatant-display.component.html`
- Modify: `src/app/blacksmith-forge/blacksmith-forge.component.html`

**Interfaces:** none — presentational only.

- [ ] **Step 1: `button-zone.component.html`**

Add `aria-hidden="true"` to the two fill `<div>`s:

```html
          <div
            class="timed-button-fill"
            *ngIf="t.running && t.config.duration.type === 'fixed'"
            aria-hidden="true"
            [style.width.%]="t.progress * 100"></div>
```

```html
          <div class="crafting-button-fill" aria-hidden="true" [style.width.%]="c.progress * 100"></div>
```

(Both fills sit inside a button whose own visible label text — e.g. "Waiting...",
"Collect Prey", the crafting label — already conveys state; the fill is pure visual
reinforcement.)

- [ ] **Step 2: `combatant-display.component.html`**

```html
<div class="combatant-display">
  <div class="combatant-name">{{ name }}</div>
  <pre class="combatant-ascii" aria-hidden="true">{{ ascii }}</pre>
  <div class="combatant-hp-bar">
    <div class="combatant-hp-fill" aria-hidden="true" [style.width.%]="hpPercent"></div>
    <div class="combatant-hp-label">{{ hp }} / {{ maxHp }}</div>
  </div>
</div>
```

(`.combatant-name` and `.combatant-hp-label` already give a screen reader everything
the ASCII art and the fill color visually convey.)

- [ ] **Step 3: `blacksmith-forge.component.html`**

```html
      <div class="craft-button-fill" *ngIf="p.active" aria-hidden="true" [style.width.%]="p.progress * 100"></div>
```

- [ ] **Step 4: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green — `aria-hidden` doesn't affect any existing selector or
assertion.

- [ ] **Step 5: Commit**

```bash
git add src/app/game-area/button-zone/button-zone.component.html src/app/fighter-combat/combatant-display/combatant-display.component.html src/app/blacksmith-forge/blacksmith-forge.component.html
git commit -m "Hide decorative fill bars and combat ASCII art from screen readers"
```

---

### Task 11: State-attribute sweep — `aria-pressed`/`aria-current` on toggle-style buttons

Filter bars, Character Select, and the combat area-select all already convey "currently
active" only through color/border. Add the matching ARIA state attribute to each so a
screen reader announces it too.

**Files:**
- Modify: `src/app/party-vault/party-vault.component.html`
- Modify: `src/app/activity-log/activity-log.component.html`
- Modify: `src/app/character-select/character-select.component.html`
- Modify: `src/app/fighter-combat/combat-controls/combat-controls.component.html`
- Modify: `src/app/fighter-combat/combat-controls/combat-controls.component.spec.ts`

**Interfaces:** none — presentational only.

- [ ] **Step 1: Add a failing spec for the one file with an existing spec to extend**

Add this test to `src/app/fighter-combat/combat-controls/combat-controls.component.spec.ts`
(after the existing `'renders a button for each configured area...'` test):

```ts
  it('reflects the selected area via aria-pressed, not just the active CSS class', () => {
    const button = fixture.nativeElement.querySelector('.area-button') as HTMLElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
```

Run: `npm run test:unit`
Expected: the new test FAILS (`aria-pressed` is `null` against the current template).

- [ ] **Step 2: `party-vault.component.html` filter buttons**

```html
    <button
      class="filter-btn"
      [class.active]="allActive"
      [attr.aria-pressed]="allActive"
      (click)="toggleAllFilters()">
      ALL
    </button>
    <span class="filter-sep">|</span>
    <button
      class="filter-btn"
      *ngFor="let c of characters"
      [class.active]="activeFilters.has(c.id)"
      [attr.aria-pressed]="activeFilters.has(c.id)"
      [style.color]="activeFilters.has(c.id) ? c.color : null"
      [style.borderColor]="activeFilters.has(c.id) ? c.color : null"
      (click)="toggleFilter(c.id)">
      {{ c.label }}
    </button>
```

- [ ] **Step 3: `activity-log.component.html` filter buttons**

```html
      <button
        class="filter-btn"
        [class.active]="allActive"
        [attr.aria-pressed]="allActive"
        data-type="all"
        (click)="toggleAllFilters()">
        ALL
      </button>
      <span class="filter-sep">|</span>
      <button
        class="filter-btn"
        *ngFor="let f of filters"
        [class.active]="activeFilters.has(f.value)"
        [attr.aria-pressed]="activeFilters.has(f.value)"
        [attr.data-type]="f.value"
        (click)="toggleFilter(f.value)">
        {{ f.label }}
      </button>
```

- [ ] **Step 4: `character-select.component.html`**

```html
<div class="character-select">
  <button
    *ngFor="let slot of slots"
    class="character-box"
    [class.active]="slot.id === active"
    [attr.aria-current]="slot.id === active ? 'true' : null"
    [class.has-attention]="hasAttention(slot.id) && !reducedMotion"
    [class.has-attention-static]="hasAttention(slot.id) && reducedMotion"
    [style.borderColor]="slot.id === active ? slot.color : null"
    (click)="select(slot.id)">
    {{ slot.label }}
  </button>
</div>
```

- [ ] **Step 5: `combat-controls.component.html`**

```html
    <button
      *ngFor="let area of areas"
      class="area-button"
      [class.active]="selectedAreaId === area.id"
      [attr.aria-pressed]="selectedAreaId === area.id"
      [disabled]="inEncounter"
      (click)="selectArea(area.id)">
      {{ areaLabel(area.id) }}
    </button>
```

- [ ] **Step 6: Run the spec from Step 1 to verify it now passes**

Run: `npm run test:unit`
Expected: the `CombatControlsComponent` spec from Step 1 now PASSES.

- [ ] **Step 7: Run the full unit + e2e suite**

Run: `npm run test:all`
Expected: everything still green.

- [ ] **Step 8: Manual check**

Run `npm start`, confirm Party Vault / Activity Log filter buttons, Character Select
boxes, and the combat area button all still look and behave exactly as before — this
task only adds attributes, no visual change.

- [ ] **Step 9: Commit**

```bash
git add src/app/party-vault/party-vault.component.html src/app/activity-log/activity-log.component.html src/app/character-select/character-select.component.html src/app/fighter-combat/combat-controls/
git commit -m "Announce toggle-button state via aria-pressed/aria-current, not color alone"
```

---

### Task 12: `AGENTS.md` — permanent Accessibility section

**Files:**
- Modify: `AGENTS.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Insert a new numbered section**

Open `AGENTS.md`. Section 18 ("Design Patterns (cross-cutting)", line 335) is currently
the last numbered section, immediately followed by the unnumbered `## Testing` (line
378). Insert a new `## 19. Accessibility...` section between them — right before
`## Testing`:

```markdown
## 19. Accessibility (keyboard + screen reader)

Every interactive element must be keyboard-operable and screen-reader-announced — for
all UI, present and future, not just what the initial retrofit covered.

- **Promote a clickable `<div>`/`<span>` to a real `<button>`**, rather than inventing a
  `role="button"`-plus-keydown pattern — `<button>` is the one interactive primitive
  this whole app already uses everywhere else, and it gets keyboard focus/activation for
  free. Only skip this when the element isn't actually interactive (e.g. a resource row
  with nothing to expand stays a plain `<div>`, never a focusable no-op).
- **`UiModalComponent` already gives every modal dialog semantics, a focus trap, and
  focus-return-on-close for free** (`role="dialog"`, `aria-modal`, `aria-labelledby`,
  Tab/Shift+Tab wrapped inside the panel, focus moved in on open and restored to the
  trigger on close) — route any new modal-like surface through it rather than building a
  new one.
- **`TooltipDirective` already gives every tooltip keyboard parity for free** (shows on
  focus the same as pointerenter, wires `aria-describedby`) — route any new hover-detail
  UI through it rather than building a new one.
- **Decorative content gets `aria-hidden="true"`**: ASCII art, a bracket glyph that's
  redundant with its already-labelled parent button, and every progress-fill bar
  (redundant with the adjacent real text that already states the same number/state).
  Don't add `role="progressbar"` to a fill bar — see §Design Patterns and the
  accessibility retrofit's design doc (`docs/superpowers/specs/`) for why.
- **A rare/discrete event that already logs above `'default'` level in the Activity Log
  is announced for free** via the shared live-region announcer
  (`LiveAnnouncerComponent`) — don't add a second announcement mechanism, and don't log
  high-frequency/continuous content (ticking currency, HP during a fight, running
  timers) above `'default'` just to make it live-announced; that content stays readable
  on demand as real text, not auto-announced.
- **A toggle-style button's current state gets `aria-pressed`/`aria-current`/
  `aria-checked`/`aria-expanded`** (whichever fits — see Party Vault/Activity Log filter
  bars, Character Select, Options toggles, the combat area-select for reference
  implementations) in addition to its `.active`/`.on`-style CSS class — color/border
  alone never conveys state to a screen reader.
- **`@axe-core/playwright` runs in e2e** (`e2e/accessibility.spec.ts`, §Testing) as a
  regression gate, not the primary design tool — fix a violation at the component level
  per the conventions above, not by suppressing the check. It deliberately excludes the
  `color-contrast` rule (a pre-existing property of this game's dark terminal palette,
  out of scope for this retrofit — see the design doc's Non-goals) — don't disable any
  other rule without updating that doc's reasoning.
```

- [ ] **Step 2: Add the new e2e spec to the Testing section's spec list**

Find the "### E2E suite (`e2e/`)" subsection under "## Testing" and add a bullet after
the existing ones:

```markdown
- **`e2e/accessibility.spec.ts`** — runs `@axe-core/playwright` against a handful of
  representative screens/states (fresh game, Fighter Combat active, Blacksmith Forge
  active, each of Options/Stats/Dev Tools open) and asserts zero violations
  (`color-contrast` excluded — see §19 Accessibility). Extend the state list whenever a
  new structurally-distinct screen is added, same spirit as the config-integrity suite.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "AGENTS.md: add the Accessibility section as a permanent requirement"
```

---

### Task 13: Automated guard — `@axe-core/playwright` e2e scan

**Files:**
- Modify: `package.json`
- Create: `e2e/accessibility.spec.ts`

**Interfaces:** none — this is the final verification layer, consumes nothing from
earlier tasks except the app itself now being accessible.

- [ ] **Step 1: Add the dependency**

Run: `npm install --save-dev @axe-core/playwright`
Expected: `package.json`'s `devDependencies` gains `"@axe-core/playwright": "^<version>"`
and `package-lock.json` updates.

- [ ] **Step 2: Write the e2e spec**

Create `e2e/accessibility.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoFreshGame, seedSave, seedBlacksmithForgeReadySave, openDevTools } from './helpers';

/**
 * Automated accessibility regression gate — see AGENTS.md §19 Accessibility. Scans a
 * handful of structurally-distinct screens/states, not every screen combinatorially.
 * `color-contrast` is deliberately excluded: this game's dark terminal palette (muted
 * grays on near-black, AGENTS.md §3) predates this check and reworking it is a visual
 * redesign, explicitly out of scope for the accessibility retrofit — see
 * docs/superpowers/specs/2026-10-27-accessibility-retrofit-design.md's Non-goals.
 */
async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
}

test.describe('Accessibility', () => {
  test('fresh game, default screen', async ({ page }) => {
    await gotoFreshGame(page);
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('Fighter Combat active', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);
    await expect(page.locator('app-fighter-combat')).toBeVisible();

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('Blacksmith Forge active', async ({ page }) => {
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);
    await expect(page.locator('app-blacksmith-forge')).toBeVisible();

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  for (const modal of [
    { label: 'Options', selector: '.options-panel' },
    { label: 'Stats', selector: '.stats-panel' },
  ] as const) {
    test(`${modal.label} modal open`, async ({ page }) => {
      await gotoFreshGame(page);
      await page.click(`text=${modal.label}`);
      await expect(page.locator(modal.selector)).toBeVisible();

      const results = await scan(page);
      expect(results.violations).toEqual([]);
    });
  }

  test('Dev Tools modal open', async ({ page }) => {
    await gotoFreshGame(page);
    await openDevTools(page);

    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test e2e/accessibility.spec.ts`
Expected: all 6 tests PASS with zero violations. If any violation appears, it means an
earlier task missed something — fix the component per the conventions in `AGENTS.md`
§19, don't disable the rule.

- [ ] **Step 4: Run the full suite one more time**

Run: `npm run test:all`
Expected: everything green, including the new accessibility spec.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json e2e/accessibility.spec.ts
git commit -m "Add @axe-core/playwright accessibility regression scan"
```

---

## Final verification (not a task — a checklist before calling this plan done)

- [ ] `npm run test:all` is green.
- [ ] Manual keyboard-only pass: unplug the mouse mentally — Tab through the top bar,
  character select, the primary button, Party Vault, the side panel, open and close
  every modal via keyboard alone (Tab to the nav button, Enter, Tab around inside, Esc
  to close, confirm focus lands back on the nav button), open Fighter Combat and tab
  through Inventory/Equipment, confirm nothing is unreachable and nothing traps focus
  outside a modal.
- [ ] Manual screen-reader spot-check (Windows Narrator, Ctrl+Win+Enter to start) on at
  least: the top bar, a modal open/close, claiming an objective (confirm the live
  announcement fires), toggling an Options switch.
