import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    // A fresh boot every time — AppComponent's constructor pulls in SaveService, which
    // reads real localStorage. Without clearing it, state left over from a previous test
    // (or a previous local `ng serve` session sharing the same karma origin) would leak
    // in and make this non-deterministic.
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('creates the app and boots every top-level system with no errors', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the top bar, character select, party vault, quests, and activity log', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // "Stats"/"Options" rather than "Dev Tools" — the latter is gated behind
    // DEV_TOOLS_ENABLED (game-config.ts) and shouldn't make this test flip if that's
    // ever turned off for a release build.
    expect(text).toContain('Stats');
    expect(text).toContain('Options');
    expect(text).toContain('PARTY VAULT');
    expect(text).toContain('QUESTS');
    expect(text).toContain('ACTIVITY LOG');
  });
});
