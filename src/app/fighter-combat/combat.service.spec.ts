import { TestBed } from '@angular/core/testing';
import { CombatService } from './combat.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { COMBAT_TURN_MS, FIGHTER_DEFEAT_LOCKOUT_MS } from '../configs/game-config';

const KOBOLD_DEN = 'kobold-den';

describe('CombatService', () => {
  let service: CombatService;
  let wallet: WalletService;
  let statistics: StatisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    jasmine.clock().install();
    // install() alone only fakes setTimeout/setInterval — mockDate() is what makes
    // Date.now() (what CombatService actually measures elapsed time against) move
    // together with tick(), same reasoning as timed-actions.service.spec.ts.
    jasmine.clock().mockDate();
    service = TestBed.inject(CombatService);
    wallet = TestBed.inject(WalletService);
    statistics = TestBed.inject(StatisticsService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('starts with full HP, no lockout, and no active encounter', () => {
    expect(service.currentFighterHp).toBe(service.fighterMaxHp);
    expect(service.canFight).toBeTrue();
    expect(service.activeEncounter).toBeNull();
  });

  describe('start()', () => {
    it("begins an encounter against the area's enemy", () => {
      service.start(KOBOLD_DEN);
      expect(service.activeEncounter?.enemyId).toBe('kobold');
    });

    it('is a no-op if a fight is already active', () => {
      service.start(KOBOLD_DEN);
      const first = service.activeEncounter;
      service.start(KOBOLD_DEN);
      expect(service.activeEncounter).toBe(first);
    });

    it('is a no-op for an unknown area', () => {
      service.start('not-a-real-area');
      expect(service.activeEncounter).toBeNull();
    });

    it('is a no-op while locked out after a defeat', () => {
      service.restore({ fighterHp: 1, lockedOutUntil: Date.now() + 1000, activeEncounter: null });
      service.start(KOBOLD_DEN);
      expect(service.activeEncounter).toBeNull();
    });
  });

  describe('flee()', () => {
    it('ends the encounter immediately with no lockout', () => {
      service.start(KOBOLD_DEN);
      service.flee();
      expect(service.activeEncounter).toBeNull();
      expect(service.canFight).toBeTrue();
    });

    it('is a no-op when no fight is active', () => {
      expect(() => service.flee()).not.toThrow();
      expect(service.activeEncounter).toBeNull();
    });
  });

  describe('turn resolution', () => {
    it('a won fight grants gold, records the kill, and leaves Fight! immediately available', () => {
      spyOn(statistics, 'recordAction');
      service.restore({
        fighterHp: service.fighterMaxHp,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 1, actorTurn: 'fighter', turns: [] },
      });
      // The Fighter's base Strength (15) beats the Kobold's base Dexterity (10) even on
      // an equal max roll, so a single constant stub is enough to guarantee a hit.
      spyOn(Math, 'random').and.returnValue(0.9999);
      jasmine.clock().tick(COMBAT_TURN_MS);

      expect(service.activeEncounter).toBeNull();
      expect(wallet.getAmount('gold')).toBeGreaterThan(0);
      expect(statistics.recordAction).toHaveBeenCalledWith('fighter-defeat-kobold');
      expect(service.canFight).toBeTrue();
    });

    it('a lost fight revives the Fighter to full HP and starts the defeat lockout', () => {
      service.restore({
        fighterHp: 1,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy', turns: [] },
      });
      // The Kobold's base Strength (8) is below the Fighter's base Dexterity (13), so a
      // hit needs an explicit high attack roll / low defense roll rather than one
      // constant stub.
      spyOn(Math, 'random').and.returnValues(0.9999, 0, 0.9999);
      jasmine.clock().tick(COMBAT_TURN_MS);

      expect(service.activeEncounter).toBeNull();
      expect(service.currentFighterHp).toBe(service.fighterMaxHp);
      expect(service.canFight).toBeFalse();
      expect(service.lockedOutRemainingMs).toBeGreaterThan(0);
    });

    it('Fight! re-enables once the defeat lockout fully elapses', () => {
      service.restore({
        fighterHp: 1,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy', turns: [] },
      });
      spyOn(Math, 'random').and.returnValues(0.9999, 0, 0.9999);
      jasmine.clock().tick(COMBAT_TURN_MS);
      expect(service.canFight).toBeFalse();

      jasmine.clock().tick(FIGHTER_DEFEAT_LOCKOUT_MS);
      expect(service.canFight).toBeTrue();
    });

    it('does nothing while it is not yet time for the next turn', () => {
      service.start(KOBOLD_DEN);
      const enemyHpBefore = service.activeEncounter!.enemyHp;
      jasmine.clock().tick(COMBAT_TURN_MS - 1);
      expect(service.activeEncounter?.enemyHp).toBe(enemyHpBefore);
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips HP, lockout, and an in-progress encounter', () => {
      service.start(KOBOLD_DEN);
      const snapshot = service.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CombatService);
      restored.restore(snapshot);

      expect(restored.activeEncounter).toEqual(snapshot.activeEncounter);
      expect(restored.currentFighterHp).toBe(snapshot.fighterHp);
    });

    it('does not replay any turns for time that passed before restore() is called', () => {
      service.start(KOBOLD_DEN);
      const snapshot = service.getSnapshot();
      const enemyHpBefore = snapshot.activeEncounter!.enemyHp;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CombatService);
      jasmine.clock().tick(60 * 60 * 1000); // an hour passes on the fresh instance's own clock
      restored.restore(snapshot);

      // restore() just re-anchored nextTurnAt to "now" - no turn has resolved yet.
      expect(restored.activeEncounter?.enemyHp).toBe(enemyHpBefore);
    });
  });
});
