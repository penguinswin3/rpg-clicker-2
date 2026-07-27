import { TestBed } from '@angular/core/testing';
import { TimedActionsService, TimedActionsSnapshot } from './timed-actions.service';
import { WalletService } from '../economy/wallet.service';
import { UnlocksService } from '../shared/unlocks.service';
import { StatisticsService } from '../statistics/statistics.service';
import { TIMED_ACTION_TICK_MS, TIMED_ACTIONS } from '../configs/game-config';

const GUILD_CONTRACT = 'fighter-guild-contract';
const BAIT_TRAP = 'ranger-bait-trap';

describe('TimedActionsService', () => {
  let timedActions: TimedActionsService;
  let wallet: WalletService;
  let unlocks: UnlocksService;
  let statistics: StatisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    jasmine.clock().install();
    // install() alone only fakes setTimeout/setInterval — mockDate() is what makes
    // Date.now() (what TimedActionsService actually measures elapsed time against) move
    // together with tick(), rather than staying pinned to the real wall clock.
    jasmine.clock().mockDate();
    timedActions = TestBed.inject(TimedActionsService);
    wallet = TestBed.inject(WalletService);
    unlocks = TestBed.inject(UnlocksService);
    statistics = TestBed.inject(StatisticsService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function stateFor(id: string) {
    return timedActions.actions.find(a => a.config.id === id)!;
  }

  describe('unlockKey gating', () => {
    it('a config with no unlockKey (Bait Trap) is always unlocked', () => {
      expect(stateFor(BAIT_TRAP).unlocked).toBeTrue();
    });

    it('a config with an unlockKey (Guild Contract) is locked until UnlocksService says so', () => {
      expect(unlocks.isUnlocked('guildContract')).toBeFalse();
      expect(stateFor(GUILD_CONTRACT).unlocked).toBeFalse();
      unlocks.unlock('guildContract');
      expect(stateFor(GUILD_CONTRACT).unlocked).toBeTrue();
    });
  });

  describe('start()', () => {
    it('no-ops for an unknown id', () => {
      expect(() => timedActions.start('not-a-real-id')).not.toThrow();
    });

    it('no-ops while already running (does not re-charge cost or re-roll)', () => {
      wallet.add('bait', 10);
      timedActions.start(BAIT_TRAP);
      const spentAfterFirstStart = wallet.getAmount('bait');
      timedActions.start(BAIT_TRAP);
      expect(wallet.getAmount('bait')).toBe(spentAfterFirstStart);
    });

    it('no-ops (and charges nothing) if the cost is unaffordable', () => {
      expect(wallet.getAmount('bait')).toBe(0);
      timedActions.start(BAIT_TRAP);
      expect(stateFor(BAIT_TRAP).running).toBeFalse();
      expect(wallet.getAmount('bait')).toBe(0);
    });

    it('charges the exact cost up front', () => {
      wallet.add('bait', 5);
      timedActions.start(BAIT_TRAP);
      expect(wallet.getAmount('bait')).toBe(4); // Bait Trap costs 1 Bait
      expect(stateFor(BAIT_TRAP).running).toBeTrue();
    });

    it('a free-to-start action (Guild Contract) needs no cost/wallet balance', () => {
      unlocks.unlock('guildContract');
      timedActions.start(GUILD_CONTRACT);
      expect(stateFor(GUILD_CONTRACT).running).toBeTrue();
    });
  });

  describe('fixed duration (Guild Contract) — auto-completes, no collect() needed', () => {
    beforeEach(() => unlocks.unlock('guildContract'));

    it('never reports "ready" — requiresCollection is unset', () => {
      timedActions.start(GUILD_CONTRACT);
      jasmine.clock().tick(10_000);
      expect(stateFor(GUILD_CONTRACT).ready).toBeFalse();
    });

    it('pays out automatically once its duration elapses, clearing the running state', () => {
      const before = wallet.getAmount('gold');
      timedActions.start(GUILD_CONTRACT);
      expect(stateFor(GUILD_CONTRACT).running).toBeTrue();

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);

      expect(stateFor(GUILD_CONTRACT).running).toBeFalse();
      expect(wallet.getAmount('gold')).toBeGreaterThan(before); // +15 base, possibly doubled
    });

    it('records the completion via StatisticsService, so it counts toward an action-count objective', () => {
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      timedActions.start(GUILD_CONTRACT);
      expect(recordAction).not.toHaveBeenCalled(); // not yet — starting isn't completing

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);
      expect(recordAction).toHaveBeenCalledOnceWith(GUILD_CONTRACT);
    });

    it('progress climbs from 0 toward 1 and clamps there, never exceeding it', () => {
      timedActions.start(GUILD_CONTRACT);
      jasmine.clock().tick(5_000);
      const midProgress = stateFor(GUILD_CONTRACT).progress;
      expect(midProgress).toBeGreaterThan(0);
      expect(midProgress).toBeLessThan(1);

      jasmine.clock().tick(50_000); // well past completion
      // By now it's auto-completed and cleared, so progress reads as the idle 0, not a
      // clamped 1 — completion clears the instance rather than leaving it "done" forever.
      expect(stateFor(GUILD_CONTRACT).progress).toBe(0);
    });
  });

  describe('random duration + requiresCollection (Bait Trap)', () => {
    function startBaitTrap() {
      wallet.add('bait', 10);
      timedActions.start(BAIT_TRAP);
    }

    it('is still running just before the shortest possible roll (5s) could ever complete', () => {
      startBaitTrap();
      jasmine.clock().tick(4_999);
      expect(stateFor(BAIT_TRAP).running).toBeTrue();
      expect(stateFor(BAIT_TRAP).ready).toBeFalse();
    });

    it('is always ready by the longest possible roll (20s) plus one tick', () => {
      startBaitTrap();
      jasmine.clock().tick(20_000 + TIMED_ACTION_TICK_MS);
      expect(stateFor(BAIT_TRAP).ready).toBeTrue();
      expect(stateFor(BAIT_TRAP).running).toBeFalse();
    });

    it('does NOT pay out on its own — the instance stays in place until collect() is called', () => {
      const before = wallet.getAmount('raw-meat');
      startBaitTrap();
      jasmine.clock().tick(20_000 + TIMED_ACTION_TICK_MS);
      expect(wallet.getAmount('raw-meat')).toBe(before);
    });

    it('collect() no-ops while still running (before the roll elapses)', () => {
      startBaitTrap();
      jasmine.clock().tick(1_000);
      timedActions.collect(BAIT_TRAP);
      expect(stateFor(BAIT_TRAP).running).toBeTrue();
      expect(wallet.getAmount('raw-meat')).toBe(0);
    });

    it('records the collection via StatisticsService — not the start, and not a no-op collect() while running', () => {
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      startBaitTrap();
      expect(recordAction).not.toHaveBeenCalled();

      jasmine.clock().tick(1_000);
      timedActions.collect(BAIT_TRAP); // still running — no-op, must not record
      expect(recordAction).not.toHaveBeenCalled();

      jasmine.clock().tick(20_000);
      timedActions.collect(BAIT_TRAP);
      expect(recordAction).toHaveBeenCalledOnceWith(BAIT_TRAP);
    });

    it('collect() pays the base reward once ready, and clears the instance', () => {
      spyOn(Math, 'random').and.returnValue(0.999); // roll near the top of the 5-20s range, no bonus/double
      startBaitTrap();
      jasmine.clock().tick(20_000 + TIMED_ACTION_TICK_MS);

      timedActions.collect(BAIT_TRAP);

      expect(wallet.getAmount('raw-meat')).toBe(1); // base reward, no Extra Baiting purchased
      expect(stateFor(BAIT_TRAP).ready).toBeFalse();
      expect(stateFor(BAIT_TRAP).running).toBeFalse();
    });

    it('rolls the bonus reward (Pelt) independently — guaranteed with a low enough roll', () => {
      spyOn(Math, 'random').and.returnValue(0); // guarantees success on any < comparison
      startBaitTrap();
      jasmine.clock().tick(20_000 + TIMED_ACTION_TICK_MS);
      timedActions.collect(BAIT_TRAP);
      expect(wallet.getAmount('pelt')).toBe(1);
    });

    it('skips the bonus reward on a high roll (base chance is only 10%)', () => {
      spyOn(Math, 'random').and.returnValue(0.99);
      startBaitTrap();
      jasmine.clock().tick(20_000 + TIMED_ACTION_TICK_MS);
      timedActions.collect(BAIT_TRAP);
      expect(wallet.getAmount('pelt')).toBe(0);
    });
  });

  describe('changes$', () => {
    it('fires on start(), on the running->ready transition, and on collect()', () => {
      let emissions = 0;
      timedActions.changes$.subscribe(() => emissions++);

      wallet.add('bait', 10);
      timedActions.start(BAIT_TRAP);
      expect(emissions).toBe(1);

      jasmine.clock().tick(20_000 + TIMED_ACTION_TICK_MS);
      expect(emissions).toBe(2); // the running -> ready transition, exactly once

      jasmine.clock().tick(20_000); // sitting in "ready" a while longer must not re-fire
      expect(emissions).toBe(2);

      timedActions.collect(BAIT_TRAP);
      expect(emissions).toBe(3);
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips a running fixed-duration action and its remaining progress', () => {
      unlocks.unlock('guildContract');
      timedActions.start(GUILD_CONTRACT);
      jasmine.clock().tick(4_000);
      const snapshot = timedActions.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(TimedActionsService);
      TestBed.inject(UnlocksService).unlock('guildContract');
      restored.restore(snapshot);

      const progress = restored.actions.find(a => a.config.id === GUILD_CONTRACT)!.progress;
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
    });

    it('round-trips a running random-duration action using its already-rolled duration, not a fresh roll', () => {
      wallet.add('bait', 10);
      timedActions.start(BAIT_TRAP);
      jasmine.clock().tick(4_999); // guaranteed still running (min roll is 5s)
      const snapshot = timedActions.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(TimedActionsService);
      restored.restore(snapshot);

      // Still not ready 1ms later, matching the original roll rather than a smaller
      // fresh one that might have already elapsed.
      expect(restored.actions.find(a => a.config.id === BAIT_TRAP)!.ready).toBeFalse();
    });

    it('accepts a pre-requiresCollection save (a bare startedAt number, not {startedAt, rolledMs})', () => {
      unlocks.unlock('guildContract');
      const legacySnapshot = { [GUILD_CONTRACT]: Date.now() - 4_000 } as unknown as TimedActionsSnapshot;

      timedActions.restore(legacySnapshot);

      const state = stateFor(GUILD_CONTRACT);
      expect(state.running).toBeTrue();
      expect(state.progress).toBeCloseTo(0.4, 1);
    });

    it('restoring an already-elapsed requiresCollection action lands directly in "ready", not "running"', () => {
      const snapshot: TimedActionsSnapshot = { [BAIT_TRAP]: { startedAt: Date.now() - 25_000, rolledMs: 20_000 } };
      timedActions.restore(snapshot);

      const state = stateFor(BAIT_TRAP);
      expect(state.ready).toBeTrue();
      expect(state.running).toBeFalse();
    });
  });
});
