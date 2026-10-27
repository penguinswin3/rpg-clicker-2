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

  it('the close control is a real button whose accessible name contains its visible text', () => {
    openModal();
    const close: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-close');
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('aria-label')).toBe('Close [x]');
    expect(close.getAttribute('aria-label')).toContain(close.textContent!.trim());
  });
});
