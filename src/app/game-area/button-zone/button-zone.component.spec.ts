import { TestBed } from '@angular/core/testing';
import { ButtonZoneComponent } from './button-zone.component';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { StatisticsService } from '../../statistics/statistics.service';
import { WalletService } from '../../economy/wallet.service';
import { TimedActionsService, TimedActionState } from '../../timed-actions/timed-actions.service';
import { CHARACTER_ACTIONS, TIMED_ACTIONS, TimedActionConfig } from '../../configs/game-config';

function fakeState(config: TimedActionConfig, overrides: Partial<TimedActionState> = {}): TimedActionState {
  return { config, unlocked: true, running: false, ready: false, progress: 0, ...overrides };
}

describe('ButtonZoneComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ButtonZoneComponent] });
  });

  describe('statistic tracking — every CHARACTER_ACTIONS entry must record its press', () => {
    // Loops the real config rather than hardcoding "Cut Bait"/"Hard Labor" by name, so a
    // future character's primary button is covered automatically the moment it's added —
    // this is the generic "statistic tracking is present" invariant check.
    for (const action of CHARACTER_ACTIONS) {
      it(`records "${action.id}" and pays out to its resource on click`, () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const characters = TestBed.inject(CharacterSelectService);
        const statistics = TestBed.inject(StatisticsService);
        const wallet = TestBed.inject(WalletService);

        characters.unlock(action.characterId);
        characters.select(action.characterId);
        fixture.componentInstance.activeCharacterId = action.characterId;

        const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
        const before = wallet.getAmount(action.resourceId);

        fixture.componentInstance.onAction();

        expect(recordAction).toHaveBeenCalledOnceWith(action.id);
        expect(wallet.getAmount(action.resourceId)).toBeGreaterThan(before);
      });
    }
  });

  describe('onTimedAction — phase-dependent click handler', () => {
    it('starts an idle action', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const wallet = TestBed.inject(WalletService);
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      wallet.add('bait', 5);

      fixture.componentInstance.onTimedAction(fakeState(baitTrap));

      expect(wallet.getAmount('bait')).toBe(4); // charged its 1-Bait cost
    });

    it('does nothing while running (relies on the button already being disabled)', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const wallet = TestBed.inject(WalletService);
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      wallet.add('bait', 5);

      fixture.componentInstance.onTimedAction(fakeState(baitTrap, { running: true }));

      expect(wallet.getAmount('bait')).toBe(5); // untouched — no double-charge
    });

    it('collects a ready action', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const timedActions = TestBed.inject(TimedActionsService);
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;

      spyOn(timedActions, 'collect');
      fixture.componentInstance.onTimedAction(fakeState(baitTrap, { ready: true }));

      expect(timedActions.collect).toHaveBeenCalledOnceWith('ranger-bait-trap');
    });
  });

  describe('timedActionLabel', () => {
    const guildContract = TIMED_ACTIONS.find(a => a.id === 'fighter-guild-contract')!;
    const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;

    it('shows the idle label when neither running nor ready', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      expect(fixture.componentInstance.timedActionLabel(fakeState(baitTrap))).toBe('Bait Trap');
    });

    it('shows the ready label once ready, even if also (nominally) not running', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      expect(fixture.componentInstance.timedActionLabel(fakeState(baitTrap, { ready: true }))).toBe('Collect Prey');
    });

    it("a fixed-duration action's running label falls back to its idle label (no dots)", () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      expect(fixture.componentInstance.timedActionLabel(fakeState(guildContract, { running: true }))).toBe(
        'Guild Contract'
      );
    });

    it('a random-duration action cycles 1-3 dots while running, always at a constant total length', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const seenLabels = new Set<string>();

      let simulatedNow = 0;
      spyOn(Date, 'now').and.callFake(() => simulatedNow);
      for (simulatedNow = 0; simulatedNow < 3000; simulatedNow += 100) {
        seenLabels.add(fixture.componentInstance.timedActionLabel(fakeState(baitTrap, { running: true })));
      }

      // All 3 dot-count variants show up over that span, and none of them are the bare
      // "Waiting" (always at least 1 dot) or leak past 3.
      expect([...seenLabels].every(l => l.length === [...seenLabels][0].length)).toBeTrue();
      expect([...seenLabels].some(l => l.startsWith('Waiting.') && !l.startsWith('Waiting..'))).toBeTrue();
      expect([...seenLabels].some(l => l.startsWith('Waiting...'))).toBeTrue();
    });
  });

  describe('timedActionMinWidthPx', () => {
    it('reserves width for the single widest label across idle/running(+dots)/ready', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      // "Bait Trap" (9) / "Waiting" + 3 dots (10) / "Collect Prey" (12) -> 12 is widest.
      expect(fixture.componentInstance.timedActionMinWidthPx(fakeState(baitTrap))).toContain('12ch');
    });

    it('returns the same width regardless of which phase state is passed in (never resizes)', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      const idle = fixture.componentInstance.timedActionMinWidthPx(fakeState(baitTrap));
      const running = fixture.componentInstance.timedActionMinWidthPx(fakeState(baitTrap, { running: true }));
      const ready = fixture.componentInstance.timedActionMinWidthPx(fakeState(baitTrap, { ready: true }));
      expect(idle).toBe(running);
      expect(running).toBe(ready);
    });
  });
});
