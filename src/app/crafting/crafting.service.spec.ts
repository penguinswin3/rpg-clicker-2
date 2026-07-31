import { TestBed } from '@angular/core/testing';
import { CraftingService, CraftingSnapshot } from './crafting.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { TIMED_ACTION_TICK_MS, CRAFTING_ACTIONS } from '../configs/game-config';

const FORGE_INGOTS = 'blacksmith-forge-ingots'; // 'hold': 10s, decayMultiplier 3, costs 10 ore
const SMITH_METAL = 'blacksmith-smith-metal'; // 'clicks': 10 clicks, costs 10 ingots

describe('CraftingService', () => {
  let crafting: CraftingService;
  let wallet: WalletService;
  let statistics: StatisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    jasmine.clock().install();
    jasmine.clock().mockDate();
    crafting = TestBed.inject(CraftingService);
    wallet = TestBed.inject(WalletService);
    statistics = TestBed.inject(StatisticsService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function progressFor(id: string): number {
    return crafting.actions.find(a => a.config.id === id)!.progress;
  }

  describe("'hold' mechanic (Forge Ingots)", () => {
    it('no-ops (charges nothing) and logs an error if unaffordable', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');

      expect(wallet.getAmount('ore')).toBe(0);
      crafting.startHold(FORGE_INGOTS);

      expect(wallet.getAmount('ore')).toBe(0);
      expect(progressFor(FORGE_INGOTS)).toBe(0);
      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('charges the exact cost up front on a fresh hold', () => {
      wallet.add('ore', 10);
      crafting.startHold(FORGE_INGOTS);
      expect(wallet.getAmount('ore')).toBe(0);
    });

    it('progress climbs toward 1 while held', () => {
      wallet.add('ore', 10);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(5_000); // half of the 10s hold
      expect(progressFor(FORGE_INGOTS)).toBeCloseTo(0.5, 1);
    });

    it('does not re-charge cost on a second startHold while already charging', () => {
      wallet.add('ore', 20);
      crafting.startHold(FORGE_INGOTS);
      crafting.startHold(FORGE_INGOTS);
      expect(wallet.getAmount('ore')).toBe(10); // charged exactly once
    });

    it('releasing decays progress back down, faster than it charges (decayMultiplier)', () => {
      wallet.add('ore', 10);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(5_000); // -> 0.5
      crafting.releaseHold(FORGE_INGOTS);
      jasmine.clock().tick(1_000); // decays 3x as fast: -0.3 -> 0.2
      expect(progressFor(FORGE_INGOTS)).toBeCloseTo(0.2, 1);
    });

    it('resuming a partially-decayed hold does not re-charge the cost', () => {
      wallet.add('ore', 10);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(5_000);
      crafting.releaseHold(FORGE_INGOTS);
      jasmine.clock().tick(500);
      crafting.startHold(FORGE_INGOTS); // resume, not a fresh attempt
      expect(wallet.getAmount('ore')).toBe(0); // still just the one charge
    });

    it('reaching full charge pays out 1 ingot, records the action, and resets progress', () => {
      wallet.add('ore', 10);
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      crafting.startHold(FORGE_INGOTS);

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);

      expect(wallet.getAmount('ingot')).toBe(1);
      expect(recordAction).toHaveBeenCalledOnceWith(FORGE_INGOTS);
      expect(progressFor(FORGE_INGOTS)).toBe(0);
    });

    it('fully decaying back to 0 after release keeps the cost staged — a later hold does not re-charge', () => {
      wallet.add('ore', 20);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(2_000); // -> 0.2
      crafting.releaseHold(FORGE_INGOTS);
      jasmine.clock().tick(2_000 + TIMED_ACTION_TICK_MS); // decays 3x as fast — fully drained well before this

      expect(progressFor(FORGE_INGOTS)).toBe(0);
      expect(wallet.getAmount('ore')).toBe(10); // only the first attempt's cost was ever charged

      crafting.startHold(FORGE_INGOTS);
      expect(wallet.getAmount('ore')).toBe(10); // still just the one charge — payment stayed staged
    });

    it('only a successful completion consumes the staged payment — a later attempt after that recharges', () => {
      wallet.add('ore', 10); // exactly enough for one charge, not two
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(2_000); // -> 0.2
      crafting.releaseHold(FORGE_INGOTS);
      jasmine.clock().tick(2_000 + TIMED_ACTION_TICK_MS); // fully decays, payment stays staged

      crafting.startHold(FORGE_INGOTS); // resumes the staged attempt for free
      expect(wallet.getAmount('ore')).toBe(0); // still not re-charged — this was the only charge

      // Still held straight through to completion, so this would normally auto-chain —
      // but there's no ore left for a second attempt, so it just logs an error and stops
      // rather than charging anything further.
      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);
      expect(wallet.getAmount('ingot')).toBe(1);

      wallet.add('ore', 10); // fund exactly one more attempt
      crafting.startHold(FORGE_INGOTS); // a genuinely new attempt, after completion
      expect(wallet.getAmount('ore')).toBe(0); // charged again — the prior payment was truly consumed
    });

    it('auto-chains into a fresh attempt if still held the instant one completes', () => {
      wallet.add('ore', 20); // enough for two attempts
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      crafting.startHold(FORGE_INGOTS);

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS); // first attempt completes, still held
      expect(wallet.getAmount('ingot')).toBe(1);
      expect(wallet.getAmount('ore')).toBe(0); // both attempts' cost charged already
      expect(recordAction).toHaveBeenCalledTimes(1);

      jasmine.clock().tick(5_000); // partway through the auto-started second attempt
      expect(progressFor(FORGE_INGOTS)).toBeCloseTo(0.5, 1);

      jasmine.clock().tick(5_000 + TIMED_ACTION_TICK_MS);
      expect(wallet.getAmount('ingot')).toBe(2);
      expect(recordAction).toHaveBeenCalledTimes(2);
    });

    it('does not auto-chain (and stops cleanly) if the next attempt is unaffordable', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');
      wallet.add('ore', 10); // exactly enough for one attempt, not two
      crafting.startHold(FORGE_INGOTS);

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);

      expect(wallet.getAmount('ingot')).toBe(1);
      expect(progressFor(FORGE_INGOTS)).toBe(0); // no second attempt silently started
      expect(log).toHaveBeenCalledWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('does NOT auto-chain if the button was released before the attempt completed', () => {
      wallet.add('ore', 20);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(9_000); // -> 0.9
      crafting.releaseHold(FORGE_INGOTS); // released just before it would've finished
      // Decays 3x as fast: 9000ms of progress drains in 3000ms of release — plenty of
      // margin past that instead of completing.
      jasmine.clock().tick(4_000 + TIMED_ACTION_TICK_MS);

      expect(wallet.getAmount('ingot')).toBe(0);
      expect(progressFor(FORGE_INGOTS)).toBe(0);
    });

    it('changes$ fires on start, release, and payout', () => {
      wallet.add('ore', 10);
      let emissions = 0;
      crafting.changes$.subscribe(() => emissions++);

      crafting.startHold(FORGE_INGOTS);
      expect(emissions).toBe(1);

      jasmine.clock().tick(2_000);
      crafting.releaseHold(FORGE_INGOTS);
      expect(emissions).toBe(2);

      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);
      expect(emissions).toBe(4); // resume + payout
    });
  });

  describe("'clicks' mechanic (Smith Metal)", () => {
    it('no-ops (charges nothing) and logs an error if unaffordable on the first click', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');

      expect(wallet.getAmount('ingot')).toBe(0);
      crafting.click(SMITH_METAL);

      expect(wallet.getAmount('ingot')).toBe(0);
      expect(progressFor(SMITH_METAL)).toBe(0);
      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('charges the exact cost on the first click only', () => {
      wallet.add('ingot', 10);
      crafting.click(SMITH_METAL);
      expect(wallet.getAmount('ingot')).toBe(0);

      crafting.click(SMITH_METAL);
      expect(wallet.getAmount('ingot')).toBe(0); // not charged again
    });

    it('progress advances one step per click', () => {
      wallet.add('ingot', 10);
      crafting.click(SMITH_METAL);
      crafting.click(SMITH_METAL);
      crafting.click(SMITH_METAL);
      expect(progressFor(SMITH_METAL)).toBeCloseTo(0.3, 5);
    });

    it('the 10th click pays out 1 Ironmongery, records the action, and resets the counter', () => {
      wallet.add('ingot', 10);
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      for (let i = 0; i < 10; i++) crafting.click(SMITH_METAL);

      expect(wallet.getAmount('ironmongery')).toBe(1);
      expect(recordAction).toHaveBeenCalledOnceWith(SMITH_METAL);
      expect(progressFor(SMITH_METAL)).toBe(0);
    });

    it('a later attempt after completion charges the cost again', () => {
      wallet.add('ingot', 20);
      for (let i = 0; i < 10; i++) crafting.click(SMITH_METAL);
      expect(wallet.getAmount('ingot')).toBe(10);

      crafting.click(SMITH_METAL);
      expect(wallet.getAmount('ingot')).toBe(0);
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips an in-progress click count', () => {
      wallet.add('ingot', 10);
      crafting.click(SMITH_METAL);
      crafting.click(SMITH_METAL);
      const snapshot = crafting.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CraftingService);
      restored.restore(snapshot);

      expect(restored.actions.find(a => a.config.id === SMITH_METAL)!.progress).toBeCloseTo(0.2, 5);
    });

    it('round-trips a charging hold, then applies decay for time elapsed while the save was closed', () => {
      wallet.add('ore', 10);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(6_000); // -> 0.6
      const snapshot: CraftingSnapshot = crafting.getSnapshot();

      jasmine.clock().tick(1_000); // simulates time passing while the app was closed

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CraftingService);
      restored.restore(snapshot);

      // Restored as released (can't still be holding after a reload) — 1s of decay at
      // 3x the charge rate: 0.6 -> 0.3.
      expect(restored.actions.find(a => a.config.id === FORGE_INGOTS)!.progress).toBeCloseTo(0.3, 1);
    });

    it('a hold instance whose decay-since-save already fully drained it survives restore at 0 progress, still staged', () => {
      wallet.add('ore', 10);
      crafting.startHold(FORGE_INGOTS);
      jasmine.clock().tick(2_000); // -> 0.2
      const snapshot = crafting.getSnapshot();

      jasmine.clock().tick(5_000); // way more than enough time to fully decay at 3x

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CraftingService);
      const restoredWallet = TestBed.inject(WalletService);
      restoredWallet.add('ore', 10); // same balance the original instance would have left
      restored.restore(snapshot);

      expect(restored.actions.find(a => a.config.id === FORGE_INGOTS)!.progress).toBe(0);

      restored.startHold(FORGE_INGOTS); // resuming after reload must not re-charge
      expect(restoredWallet.getAmount('ore')).toBe(10);
    });
  });

  it('has both crafting actions registered under distinct mechanics (sanity check for the tests above)', () => {
    expect(CRAFTING_ACTIONS.find(a => a.id === FORGE_INGOTS)?.mechanic.type).toBe('hold');
    expect(CRAFTING_ACTIONS.find(a => a.id === SMITH_METAL)?.mechanic.type).toBe('clicks');
  });
});
