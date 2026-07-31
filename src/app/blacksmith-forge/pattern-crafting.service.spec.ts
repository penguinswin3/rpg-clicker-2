import { TestBed } from '@angular/core/testing';
import { PatternCraftingService } from './pattern-crafting.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from '../fighter-combat/equipment.service';

const WEAPON_PATTERN = 'pattern-common-weapon'; // 5 ironmongery + 5 ingot, 60s -> forged-sword

describe('PatternCraftingService', () => {
  let service: PatternCraftingService;
  let wallet: WalletService;
  let statistics: StatisticsService;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    jasmine.clock().install();
    jasmine.clock().mockDate();
    service = TestBed.inject(PatternCraftingService);
    wallet = TestBed.inject(WalletService);
    statistics = TestBed.inject(StatisticsService);
    equipment = TestBed.inject(EquipmentService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function stateFor(id: string) {
    return service.patterns.find(p => p.config.id === id)!;
  }

  function fundWeaponPattern() {
    wallet.add('ironmongery', 5);
    wallet.add('ingot', 5);
  }

  it('all 5 Common patterns are known from the start', () => {
    const knownIds = service.patterns.filter(p => p.known).map(p => p.config.id);
    expect(knownIds).toEqual([
      'pattern-common-weapon',
      'pattern-common-helmet',
      'pattern-common-armor',
      'pattern-common-boots',
      'pattern-common-gauntlets',
    ]);
  });

  describe('start()', () => {
    it('no-ops for an unknown id', () => {
      expect(() => service.start('not-a-real-id')).not.toThrow();
    });

    it('no-ops (and charges nothing) if any cost resource is unaffordable', () => {
      service.start(WEAPON_PATTERN);
      expect(stateFor(WEAPON_PATTERN).active).toBeFalse();
      expect(wallet.getAmount('ironmongery')).toBe(0);
    });

    it('logs an error to the activity log if unaffordable', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');

      service.start(WEAPON_PATTERN);

      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('charges every cost entry exactly, up front', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      expect(wallet.getAmount('ironmongery')).toBe(0);
      expect(wallet.getAmount('ingot')).toBe(0);
      expect(stateFor(WEAPON_PATTERN).active).toBeTrue();
    });

    it('no-ops if a different craft is already active', () => {
      fundWeaponPattern();
      wallet.add('ironmongery', 3);
      wallet.add('ingot', 5); // enough left over to also afford the helmet pattern
      service.start(WEAPON_PATTERN);

      const spentAfterFirst = wallet.getAmount('ironmongery');
      service.start('pattern-common-helmet');

      expect(wallet.getAmount('ironmongery')).toBe(spentAfterFirst); // helmet's cost never charged
      expect(stateFor('pattern-common-helmet').active).toBeFalse();
    });

    it('no-ops if the item is already owned', () => {
      equipment.addToInventory('forged-sword');
      fundWeaponPattern();

      service.start(WEAPON_PATTERN);

      expect(stateFor(WEAPON_PATTERN).active).toBeFalse();
      expect(wallet.getAmount('ironmongery')).toBe(5); // never charged
    });
  });

  describe('completion', () => {
    it('grants the item to Fighter inventory once the duration elapses, and clears active', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(60_000);

      expect(equipment.getInventoryCount('forged-sword')).toBe(1);
      expect(stateFor(WEAPON_PATTERN).active).toBeFalse();
      expect(stateFor(WEAPON_PATTERN).owned).toBeTrue();
    });

    it('does not grant the item before the duration elapses', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(59_000);

      expect(equipment.getInventoryCount('forged-sword')).toBe(0);
      expect(stateFor(WEAPON_PATTERN).active).toBeTrue();
    });

    it('records the completion via StatisticsService, so it counts toward an action-count objective', () => {
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      expect(recordAction).not.toHaveBeenCalled();

      jasmine.clock().tick(60_000);
      expect(recordAction).toHaveBeenCalledOnceWith(WEAPON_PATTERN);
    });

    it('logs completion at "success" with the item label in parens', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(60_000);

      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/Forged Sword/), 'success');
    });

    it('progress climbs from 0 toward 1 while active, and resets to 0 once complete', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(30_000);
      const mid = stateFor(WEAPON_PATTERN).progress;
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);

      jasmine.clock().tick(30_000);
      expect(stateFor(WEAPON_PATTERN).progress).toBe(0); // completed and cleared, not clamped at 1
    });

    it("another pattern's progress stays 0 while a different one is active", () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      jasmine.clock().tick(30_000);
      expect(stateFor('pattern-common-helmet').progress).toBe(0);
    });
  });

  describe('unlock()', () => {
    it('is idempotent — unlocking an already-known pattern stays known, does not throw', () => {
      expect(() => service.unlock(WEAPON_PATTERN)).not.toThrow();
      expect(stateFor(WEAPON_PATTERN).known).toBeTrue();
    });
  });

  describe('changes$', () => {
    it('fires on start() and on completion', () => {
      let emissions = 0;
      service.changes$.subscribe(() => emissions++);

      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      expect(emissions).toBe(1);

      jasmine.clock().tick(60_000);
      expect(emissions).toBe(2);
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips a mid-craft active state and its remaining progress', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      jasmine.clock().tick(20_000);
      const snapshot = service.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(PatternCraftingService);
      restored.restore(snapshot);

      const progress = restored.patterns.find(p => p.config.id === WEAPON_PATTERN)!.progress;
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
    });

    it('a fresh instance with no snapshot still starts with the 5 Common patterns known', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(PatternCraftingService);
      restored.restore(undefined);

      expect(restored.patterns.filter(p => p.known).length).toBe(5);
    });
  });

  describe('rarity-upgrade patterns (upgradesFromEquipmentId)', () => {
    // No PATTERNS entry sets upgradesFromEquipmentId yet (Common tier only, this
    // version) — same "wired but unexercised" precedent as GENERATORS
    // (per-second-calculator.service.spec.ts). Replace this with a real test the moment
    // the first upgrade-tier pattern is registered; don't leave it passing for its own
    // sake.
    it('consumes the prerequisite item and grants the upgraded item in its place', () => {
      pending('no PATTERNS entry has upgradesFromEquipmentId set yet');
    });
  });
});
