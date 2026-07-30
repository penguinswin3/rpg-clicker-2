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
});
