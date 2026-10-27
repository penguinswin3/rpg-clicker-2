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

/**
 * Mirrors what app.component.html actually does: ONE `<app-ui-modal>` whose *projected
 * content* is swapped by an `ngSwitch`, with `[title]` changing alongside it — never
 * closed and reopened. That's the real Options -> Credits / Options -> Reset-Save Confirm
 * flow, and the shape of the bug: `UiModalComponent` is not destroyed/recreated across
 * the transition, so `ngAfterViewInit` never re-runs.
 */
@Component({
  standalone: true,
  imports: [CommonModule, UiModalComponent],
  template: `
    <button #trigger (click)="open = true">Open Options</button>
    <app-ui-modal *ngIf="open" [title]="screen === 'options' ? 'OPTIONS' : 'CREDITS'" (closed)="open = false">
      <ng-container [ngSwitch]="screen">
        <div *ngSwitchCase="'options'" class="options-content">
          <button class="go-credits" (click)="screen = 'credits'">Credits</button>
        </div>
        <div *ngSwitchCase="'credits'" class="credits-content">
          <button class="credits-first">Thanks</button>
          <button class="credits-last">Also Thanks</button>
        </div>
      </ng-container>
    </app-ui-modal>
  `,
})
class SwappingHostComponent {
  open = false;
  screen: 'options' | 'credits' = 'options';
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

  it('the close control is a real button whose accessible name contains its visible text', () => {
    openModal();
    const close: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-close');
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('aria-label')).toBe('Close [x]');
    expect(close.getAttribute('aria-label')).toContain(close.textContent!.trim());
  });
});

describe('UiModalComponent — content swapped inside an already-open modal', () => {
  let fixture: ComponentFixture<SwappingHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SwappingHostComponent] });
    fixture = TestBed.createComponent(SwappingHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function host(): HTMLElement {
    return fixture.nativeElement.querySelector('app-ui-modal');
  }

  function panel(): HTMLElement {
    return fixture.nativeElement.querySelector('.modal-panel');
  }

  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  function openOptions(): void {
    trigger().focus();
    fixture.componentInstance.open = true;
    fixture.detectChanges();
  }

  /** The exact bug: Tab to the in-content "Credits" button, activate it, and the element
   *  holding focus is destroyed along with the Options content. */
  function goToCredits(): void {
    const credits: HTMLButtonElement = fixture.nativeElement.querySelector('.go-credits');
    credits.focus();
    expect(document.activeElement).toBe(credits);
    credits.click();
    fixture.detectChanges();
  }

  function pressTab(from: HTMLElement, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    from.dispatchEvent(event);
    return event;
  }

  it('moves focus back inside the modal when the content swaps, instead of dropping it on <body>', () => {
    openOptions();
    goToCredits();

    expect(fixture.nativeElement.querySelector('.credits-content')).withContext('content swapped').toBeTruthy();
    expect(document.activeElement).not.toBe(document.body);
    expect(panel().contains(document.activeElement)).toBeTrue();
    // Same "first focusable, else the panel" rule the initial open uses — the close button
    // is always the first focusable in the modal (it's in the header, above ng-content).
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.modal-close'));
  });

  it('Tab still wraps correctly within the new content after the swap', () => {
    openOptions();
    goToCredits();

    const focusables: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.modal-close, .credits-first, .credits-last')
    );
    const last = focusables[focusables.length - 1];
    last.focus();

    const forward = pressTab(last);
    expect(document.activeElement).toBe(focusables[0]);
    expect(forward.defaultPrevented).toBeTrue();

    const backward = pressTab(focusables[0], true);
    expect(document.activeElement).toBe(last);
    expect(backward.defaultPrevented).toBeTrue();
  });

  it('keeps previouslyFocused pointing at the original trigger, so closing after a swap still returns there', () => {
    openOptions();
    goToCredits();

    fixture.componentInstance.open = false;
    fixture.detectChanges();

    // Not the intermediate "Credits" button (long destroyed) and not <body> — the top-bar-
    // style nav button that opened the modal in the first place.
    expect(document.activeElement).toBe(trigger());
  });

  it('pulls focus back in if it has escaped the modal entirely (defense-in-depth)', () => {
    openOptions();

    // Stand-in for anything in the page behind the backdrop, plus the ways focus can end
    // up out there while the modal is open (a since-removed trigger, a stray blur()).
    const outside = document.createElement('button');
    outside.textContent = 'Behind the backdrop';
    document.body.appendChild(outside);
    try {
      outside.focus();
      expect(host().contains(document.activeElement)).toBeFalse();

      const event = pressTab(outside);

      expect(event.defaultPrevented).toBeTrue();
      expect(host().contains(document.activeElement)).toBeTrue();
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.modal-close'));
    } finally {
      outside.remove();
    }
  });

  it('recovers from focus sitting on <body> (the post-swap failure mode) on the next Tab', () => {
    openOptions();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    const event = pressTab(document.body);

    expect(event.defaultPrevented).toBeTrue();
    expect(panel().contains(document.activeElement)).toBeTrue();
  });

  it("doesn't re-steal focus on change-detection cycles that didn't change the content", () => {
    openOptions();
    goToCredits();

    const deliberate: HTMLButtonElement = fixture.nativeElement.querySelector('.credits-last');
    deliberate.focus();

    fixture.detectChanges();
    fixture.detectChanges();

    expect(document.activeElement).toBe(deliberate);
  });
});
