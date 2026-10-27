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

  describe('landmarks', () => {
    /** The implicit roles these elements already carry are duplicated explicitly because
     *  they're `display: contents`, which has historically dropped elements (and their
     *  implicit landmark role) out of the accessibility tree in some browsers — see
     *  app.component.html. axe-core checks the DOM, so only a test like this pins it. */
    it('exposes banner/main/complementary explicitly, not only implicitly', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('header')?.getAttribute('role')).toBe('banner');
      expect(el.querySelector('main')?.getAttribute('role')).toBe('main');
      expect(el.querySelector('aside')?.getAttribute('role')).toBe('complementary');
      expect(el.querySelector('aside')?.getAttribute('aria-label')).toBe('Activity Log');
    });

    it('names the game in a real <h1> inside the banner', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const h1 = (fixture.nativeElement as HTMLElement).querySelector('header h1');

      expect(h1?.textContent?.trim()).toBe(fixture.componentInstance.gameTitle);
    });

    it("keeps the live-region announcer out of the Activity Log aside it isn't part of", () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('app-live-announcer')).withContext('still rendered').toBeTruthy();
      expect(el.querySelector('aside app-live-announcer')).toBeNull();
    });
  });
});
