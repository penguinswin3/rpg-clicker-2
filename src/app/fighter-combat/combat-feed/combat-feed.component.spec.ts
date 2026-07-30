import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatFeedComponent } from './combat-feed.component';
import { CombatService } from '../combat.service';

describe('CombatFeedComponent', () => {
  let fixture: ComponentFixture<CombatFeedComponent>;
  let combat: CombatService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CombatFeedComponent] });
    fixture = TestBed.createComponent(CombatFeedComponent);
    combat = TestBed.inject(CombatService);
  });

  it('renders nothing when there is no active encounter', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.combat-feed-line').length).toBe(0);
  });

  it("renders each of the active encounter's turns", () => {
    combat.restore({
      fighterHp: 100,
      lockedOutUntil: null,
      activeEncounter: {
        areaId: 'kobold-den',
        enemyId: 'kobold',
        enemyHp: 50,
        actorTurn: 'enemy',
        turns: [
          { actor: 'fighter', attackRoll: 25, defenseRoll: 15, hit: true, damage: 8, followUp: false },
          { actor: 'enemy', attackRoll: 12, defenseRoll: 20, hit: false, followUp: false },
        ],
      },
    });
    fixture.detectChanges();

    // fixture.nativeElement is typed `any`, so Array.from() called on it directly infers
    // `unknown[]` rather than `Element[]` (no concrete element type flows through), which
    // fails to typecheck against the explicit `(n: Element)` callback below. Same fix as
    // equipment-panel.component.spec.ts: an intermediate HTMLElement-typed variable gives
    // querySelectorAll (and therefore Array.from) a concrete Element type to infer from.
    const el: HTMLElement = fixture.nativeElement;
    const lines: string[] = Array.from(el.querySelectorAll('.combat-feed-line')).map(
      (n: Element) => n.textContent ?? ''
    );
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('You');
    expect(lines[0]).toContain('8 damage');
    expect(lines[1]).toContain('Kobold');
    expect(lines[1]).toContain('miss');
  });
});
