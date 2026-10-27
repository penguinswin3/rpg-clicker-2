import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopBarComponent } from './top-bar.component';

describe('TopBarComponent', () => {
  let component: TopBarComponent;
  let fixture: ComponentFixture<TopBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopBarComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TopBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /** AppComponent owns the real <h1>{{ gameTitle }}</h1> now, so the ASCII banner is
   *  purely decorative — hidden, not aria-labelled (aria-label on a <pre> isn't reliably
   *  exposed, and it would duplicate the h1 if it were). AGENTS.md §19. */
  it('hides the decorative ASCII title from assistive tech rather than labelling it', () => {
    const title = (fixture.nativeElement as HTMLElement).querySelector('pre.title');

    expect(title).toBeTruthy();
    expect(title!.getAttribute('aria-hidden')).toBe('true');
    expect(title!.hasAttribute('aria-label')).toBeFalse();
  });

  /** `leftButtons`/`rightButtons` hand back fresh objects on every read and this component
   *  markForChecks once a second off the playtime tick, so without a `trackBy` every nav
   *  button's DOM node is destroyed and recreated on each cycle — which drops keyboard
   *  focus to <body> within a second and leaves UiModalComponent's focus-return-on-close
   *  with a detached trigger to return to. */
  describe('nav button DOM stability (keyboard focus survival)', () => {
    function navButton(label: string): HTMLButtonElement | undefined {
      return Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('.nav-btn')).find(
        b => b.textContent?.trim() === label
      );
    }

    it('reuses the same node across change-detection cycles instead of recreating it', () => {
      const before = navButton('Options');
      expect(before).toBeTruthy();

      fixture.detectChanges();
      fixture.detectChanges();

      expect(navButton('Options')).toBe(before);
      expect(before!.isConnected).toBeTrue();
    });

    it('keeps focus on a nav button across change-detection cycles', () => {
      // document.activeElement is only meaningful for a fixture attached to the live document.
      document.body.appendChild(fixture.nativeElement);
      try {
        const options = navButton('Options')!;
        options.focus();
        expect(document.activeElement).toBe(options);

        fixture.detectChanges();
        fixture.detectChanges();

        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(navButton('Options')!);
      } finally {
        fixture.nativeElement.remove();
      }
    });
  });
});
