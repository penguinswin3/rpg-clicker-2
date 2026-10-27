import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HoldToClickDirective } from './hold-to-click.directive';

const INTERVAL_MS = 50;

@Component({
  standalone: true,
  imports: [HoldToClickDirective],
  template: `
    <button appHoldToClick [holdToClickIntervalMs]="intervalMs" (appHoldToClick)="fires = fires + 1">Act</button>
  `,
})
class HostComponent {
  intervalMs = INTERVAL_MS;
  fires = 0;
}

describe('HoldToClickDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let button: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
  });

  function key(type: 'keydown' | 'keyup', k: string): KeyboardEvent {
    const event = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    return event;
  }

  function pointer(type: 'pointerdown' | 'pointerup', button_ = 0): void {
    button.dispatchEvent(new PointerEvent(type, { button: button_, bubbles: true, cancelable: true }));
  }

  describe('pointer (pre-existing behaviour, must not regress)', () => {
    it('fires immediately on pointerdown and repeats while held', fakeAsync(() => {
      pointer('pointerdown');
      expect(fixture.componentInstance.fires).toBe(1);

      tick(INTERVAL_MS * 2);
      expect(fixture.componentInstance.fires).toBe(3);

      pointer('pointerup');
      tick(INTERVAL_MS * 3);
      expect(fixture.componentInstance.fires).toBe(3); // stopped, no stray repeats
    }));

    it('ignores non-primary mouse buttons', () => {
      pointer('pointerdown', 2);
      expect(fixture.componentInstance.fires).toBe(0);
    });
  });

  // The whole point of routing Enter/Space through the same start()/stop() the pointer
  // path uses: keyboard parity is the *same* behaviour (immediate fire + hold-to-repeat),
  // not a second single-shot implementation that could drift. See AGENTS.md §19.
  describe('keyboard parity', () => {
    for (const k of ['Enter', ' '] as const) {
      const name = k === ' ' ? 'Space' : k;

      it(`${name} fires immediately and repeats while held, then stops on keyup`, fakeAsync(() => {
        key('keydown', k);
        expect(fixture.componentInstance.fires).toBe(1);

        tick(INTERVAL_MS * 2);
        expect(fixture.componentInstance.fires).toBe(3);

        key('keyup', k);
        tick(INTERVAL_MS * 3);
        expect(fixture.componentInstance.fires).toBe(3);
      }));

      it(`${name} preventDefaults so Space can't scroll the page mid-hold`, () => {
        expect(key('keydown', k).defaultPrevented).toBeTrue();
      });

      it(`${name} auto-repeat (repeated keydown while held) doesn't stack intervals or double-fire`, fakeAsync(() => {
        key('keydown', k);
        key('keydown', k);
        key('keydown', k);
        expect(fixture.componentInstance.fires).toBe(1); // only the first press fired

        tick(INTERVAL_MS);
        expect(fixture.componentInstance.fires).toBe(2); // one interval, not three

        key('keyup', k);
      }));
    }

    it('ignores every other key', () => {
      key('keydown', 'a');
      key('keydown', 'Tab');
      key('keydown', 'ArrowDown');
      expect(fixture.componentInstance.fires).toBe(0);
    });

    it('stops repeating on blur, in case the keyup is never delivered (alt-tab mid-hold)', fakeAsync(() => {
      key('keydown', 'Enter');
      expect(fixture.componentInstance.fires).toBe(1);

      button.dispatchEvent(new FocusEvent('blur'));
      tick(INTERVAL_MS * 3);
      expect(fixture.componentInstance.fires).toBe(1);
    }));
  });

  it('clears its interval on destroy', fakeAsync(() => {
    key('keydown', 'Enter');
    fixture.destroy();
    tick(INTERVAL_MS * 3);
    expect(fixture.componentInstance.fires).toBe(1);
  }));
});
