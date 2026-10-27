import { TestBed } from '@angular/core/testing';
import { ObjectivesPanelComponent } from './objectives-panel.component';
import { ObjectivesService, ObjectiveState } from './objectives.service';
import { OBJECTIVES } from '../configs/game-config';

function state(index: number, overrides: Partial<ObjectiveState> = {}): ObjectiveState {
  return {
    config: OBJECTIVES[index],
    current: 0,
    target: 10,
    claimable: false,
    completed: false,
    ...overrides,
  };
}

describe('ObjectivesPanelComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ObjectivesPanelComponent] });
  });

  function renderRows(objectives: ObjectiveState[]): HTMLButtonElement[] {
    const fixture = TestBed.createComponent(ObjectivesPanelComponent);
    spyOnProperty(TestBed.inject(ObjectivesService), 'objectives', 'get').and.returnValue(objectives);
    fixture.detectChanges();
    return Array.from(fixture.nativeElement.querySelectorAll('.objective-row'));
  }

  /** AGENTS.md §19: a real `<button>` for anything interactive, but "never a focusable
   *  no-op" — an in-progress or already-claimed row has nothing to do, so it must not sit
   *  in the keyboard tab order advertising an action it won't perform. */
  describe('only a claimable row is an enabled button', () => {
    it('disables an in-progress row and a completed row, enables a claimable one', () => {
      const rows = renderRows([
        state(0, { current: 4 }), // in progress
        state(1, { current: 10, claimable: true }), // target reached, reward unclaimed
        state(2, { current: 10, completed: true }), // already claimed
      ]);

      expect(rows.length).toBe(3);
      expect(rows[0].disabled).withContext('in-progress row').toBeTrue();
      expect(rows[1].disabled).withContext('claimable row').toBeFalse();
      expect(rows[2].disabled).withContext('completed row').toBeTrue();
    });

    it('keeps the .claimable class and the disabled state in lockstep', () => {
      const rows = renderRows([state(0, { current: 4 }), state(1, { current: 10, claimable: true })]);

      for (const row of rows) {
        expect(row.classList.contains('claimable')).withContext(row.textContent ?? '').toBe(!row.disabled);
      }
    });
  });

  it('claim() is still a no-op for a non-claimable objective, independent of the disabled attribute', () => {
    const fixture = TestBed.createComponent(ObjectivesPanelComponent);
    const service = TestBed.inject(ObjectivesService);
    spyOn(service, 'claim');

    fixture.componentInstance.claim(state(0, { current: 4 }));
    expect(service.claim).not.toHaveBeenCalled();

    fixture.componentInstance.claim(state(1, { current: 10, claimable: true }));
    expect(service.claim).toHaveBeenCalledOnceWith(OBJECTIVES[1].id);
  });
});
