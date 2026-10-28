import { TestBed } from '@angular/core/testing';
import { CraftingService, CraftingSnapshot } from './crafting.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { TIMED_ACTION_TICK_MS, CRAFTING_ACTIONS } from '../configs/game-config';
import { UpgradesService } from '../upgrades/upgrades.service';

const SMELT_INGOTS = 'blacksmith-smelt-ingots'; // 'hold': 10s, decayMultiplier 3, costs 10 ore
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

  describe("'hold' mechanic (Smelt Ingots)", () => {
    it('no-ops (charges nothing) and logs an error if unaffordable', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');

      expect(wallet.getAmount('ore')).toBe(0);
      crafting.startHold(SMELT_INGOTS);

      expect(wallet.getAmount('ore')).toBe(0);
      expect(progressFor(SMELT_INGOTS)).toBe(0);
      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('charges the exact cost up front on a fresh hold', () => {
      wallet.add('ore', 10);
      crafting.startHold(SMELT_INGOTS);
      expect(wallet.getAmount('ore')).toBe(0);
    });

    it('progress climbs toward 1 while held', () => {
      wallet.add('ore', 10);
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(5_000); // half of the 10s hold
      expect(progressFor(SMELT_INGOTS)).toBeCloseTo(0.5, 1);
    });

    it('does not re-charge cost on a second startHold while already charging', () => {
      wallet.add('ore', 20);
      crafting.startHold(SMELT_INGOTS);
      crafting.startHold(SMELT_INGOTS);
      expect(wallet.getAmount('ore')).toBe(10); // charged exactly once
    });

    it('releasing decays progress back down, faster than it charges (decayMultiplier)', () => {
      wallet.add('ore', 10);
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(5_000); // -> 0.5
      crafting.releaseHold(SMELT_INGOTS);
      jasmine.clock().tick(1_000); // decays 3x as fast: -0.3 -> 0.2
      expect(progressFor(SMELT_INGOTS)).toBeCloseTo(0.2, 1);
    });

    it('resuming a partially-decayed hold does not re-charge the cost', () => {
      wallet.add('ore', 10);
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(5_000);
      crafting.releaseHold(SMELT_INGOTS);
      jasmine.clock().tick(500);
      crafting.startHold(SMELT_INGOTS); // resume, not a fresh attempt
      expect(wallet.getAmount('ore')).toBe(0); // still just the one charge
    });

    it('reaching full charge pays out 1 ingot, records the action, and resets progress', () => {
      wallet.add('ore', 10);
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      crafting.startHold(SMELT_INGOTS);

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);

      expect(wallet.getAmount('ingot')).toBe(1);
      expect(recordAction).toHaveBeenCalledOnceWith(SMELT_INGOTS);
      expect(progressFor(SMELT_INGOTS)).toBe(0);
    });

    it('fully decaying back to 0 after release keeps the cost staged — a later hold does not re-charge', () => {
      wallet.add('ore', 20);
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(2_000); // -> 0.2
      crafting.releaseHold(SMELT_INGOTS);
      jasmine.clock().tick(2_000 + TIMED_ACTION_TICK_MS); // decays 3x as fast — fully drained well before this

      expect(progressFor(SMELT_INGOTS)).toBe(0);
      expect(wallet.getAmount('ore')).toBe(10); // only the first attempt's cost was ever charged

      crafting.startHold(SMELT_INGOTS);
      expect(wallet.getAmount('ore')).toBe(10); // still just the one charge — payment stayed staged
    });

    it('only a successful completion consumes the staged payment — a later attempt after that recharges', () => {
      wallet.add('ore', 10); // exactly enough for one charge, not two
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(2_000); // -> 0.2
      crafting.releaseHold(SMELT_INGOTS);
      jasmine.clock().tick(2_000 + TIMED_ACTION_TICK_MS); // fully decays, payment stays staged

      crafting.startHold(SMELT_INGOTS); // resumes the staged attempt for free
      expect(wallet.getAmount('ore')).toBe(0); // still not re-charged — this was the only charge

      // Still held straight through to completion, so this would normally auto-chain —
      // but there's no ore left for a second attempt, so it just logs an error and stops
      // rather than charging anything further.
      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);
      expect(wallet.getAmount('ingot')).toBe(1);

      wallet.add('ore', 10); // fund exactly one more attempt
      crafting.startHold(SMELT_INGOTS); // a genuinely new attempt, after completion
      expect(wallet.getAmount('ore')).toBe(0); // charged again — the prior payment was truly consumed
    });

    it('auto-chains into a fresh attempt if still held the instant one completes', () => {
      wallet.add('ore', 20); // enough for two attempts
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      crafting.startHold(SMELT_INGOTS);

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS); // first attempt completes, still held
      expect(wallet.getAmount('ingot')).toBe(1);
      expect(wallet.getAmount('ore')).toBe(0); // both attempts' cost charged already
      expect(recordAction).toHaveBeenCalledTimes(1);

      jasmine.clock().tick(5_000); // partway through the auto-started second attempt
      expect(progressFor(SMELT_INGOTS)).toBeCloseTo(0.5, 1);

      jasmine.clock().tick(5_000 + TIMED_ACTION_TICK_MS);
      expect(wallet.getAmount('ingot')).toBe(2);
      expect(recordAction).toHaveBeenCalledTimes(2);
    });

    it('does not auto-chain (and stops cleanly) if the next attempt is unaffordable', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');
      wallet.add('ore', 10); // exactly enough for one attempt, not two
      crafting.startHold(SMELT_INGOTS);

      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);

      expect(wallet.getAmount('ingot')).toBe(1);
      expect(progressFor(SMELT_INGOTS)).toBe(0); // no second attempt silently started
      expect(log).toHaveBeenCalledWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('does NOT auto-chain if the button was released before the attempt completed', () => {
      wallet.add('ore', 20);
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(9_000); // -> 0.9
      crafting.releaseHold(SMELT_INGOTS); // released just before it would've finished
      // Decays 3x as fast: 9000ms of progress drains in 3000ms of release — plenty of
      // margin past that instead of completing.
      jasmine.clock().tick(4_000 + TIMED_ACTION_TICK_MS);

      expect(wallet.getAmount('ingot')).toBe(0);
      expect(progressFor(SMELT_INGOTS)).toBe(0);
    });

    it('changes$ fires on start, release, and payout', () => {
      wallet.add('ore', 10);
      let emissions = 0;
      crafting.changes$.subscribe(() => emissions++);

      crafting.startHold(SMELT_INGOTS);
      expect(emissions).toBe(1);

      jasmine.clock().tick(2_000);
      crafting.releaseHold(SMELT_INGOTS);
      expect(emissions).toBe(2);

      crafting.startHold(SMELT_INGOTS);
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
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(6_000); // -> 0.6
      const snapshot: CraftingSnapshot = crafting.getSnapshot();

      jasmine.clock().tick(1_000); // simulates time passing while the app was closed

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CraftingService);
      restored.restore(snapshot);

      // Restored as released (can't still be holding after a reload) — 1s of decay at
      // 3x the charge rate: 0.6 -> 0.3.
      expect(restored.actions.find(a => a.config.id === SMELT_INGOTS)!.progress).toBeCloseTo(0.3, 1);
    });

    it('a hold instance whose decay-since-save already fully drained it survives restore at 0 progress, still staged', () => {
      wallet.add('ore', 10);
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(2_000); // -> 0.2
      const snapshot = crafting.getSnapshot();

      jasmine.clock().tick(5_000); // way more than enough time to fully decay at 3x

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CraftingService);
      const restoredWallet = TestBed.inject(WalletService);
      restoredWallet.add('ore', 10); // same balance the original instance would have left
      restored.restore(snapshot);

      expect(restored.actions.find(a => a.config.id === SMELT_INGOTS)!.progress).toBe(0);

      restored.startHold(SMELT_INGOTS); // resuming after reload must not re-charge
      expect(restoredWallet.getAmount('ore')).toBe(10);
    });
  });

  it('has both crafting actions registered under distinct mechanics (sanity check for the tests above)', () => {
    expect(CRAFTING_ACTIONS.find(a => a.id === SMELT_INGOTS)?.mechanic.type).toBe('hold');
    expect(CRAFTING_ACTIONS.find(a => a.id === SMITH_METAL)?.mechanic.type).toBe('clicks');
  });

  describe('costPaid', () => {
    function costPaid(id: string): boolean {
      return crafting.actions.find(a => a.config.id === id)!.costPaid;
    }

    it("'hold': false before any attempt, true once charged, still true fully decayed, false after payout", () => {
      wallet.add('ore', 10);
      expect(costPaid(SMELT_INGOTS)).toBeFalse();

      crafting.startHold(SMELT_INGOTS);
      expect(costPaid(SMELT_INGOTS)).toBeTrue();

      jasmine.clock().tick(1_000);
      crafting.releaseHold(SMELT_INGOTS);
      jasmine.clock().tick(1_000 + TIMED_ACTION_TICK_MS);
      expect(progressFor(SMELT_INGOTS)).toBe(0);
      expect(costPaid(SMELT_INGOTS)).toBeTrue(); // the whole point — progress alone can't show this

      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(10_000 + TIMED_ACTION_TICK_MS);
      crafting.releaseHold(SMELT_INGOTS);
      expect(costPaid(SMELT_INGOTS)).toBeFalse();
    });

    it('stays false after an unaffordable attempt', () => {
      crafting.startHold(SMELT_INGOTS);
      expect(costPaid(SMELT_INGOTS)).toBeFalse();
    });

    it("'clicks': true after the first (charging) click, false again after payout", () => {
      wallet.add('ingot', 10);
      crafting.click(SMITH_METAL);
      expect(costPaid(SMITH_METAL)).toBeTrue();
      for (let i = 1; i < 10; i++) crafting.click(SMITH_METAL);
      expect(costPaid(SMITH_METAL)).toBeFalse();
    });
  });

  describe('Faster Smelting (crafting-speed)', () => {
    let upgrades: UpgradesService;
    beforeEach(() => {
      upgrades = TestBed.inject(UpgradesService);
      wallet.add('gold', 100_000_000);
      wallet.add('ore', 100_000_000);
    });

    it('at max (+100%) a Smelt Ingots hold completes in half the time', () => {
      for (let i = 0; i < 10; i++) upgrades.purchase('faster-smelting');
      const ingotsBefore = wallet.getAmount('ingot');
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(5_000 + TIMED_ACTION_TICK_MS);
      crafting.releaseHold(SMELT_INGOTS);
      expect(wallet.getAmount('ingot')).toBe(ingotsBefore + 1);
    });

    it('a level bought mid-hold speeds up only the rest of the charge, not what was already charged', () => {
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(5_000); // 50% at 1x
      for (let i = 0; i < 10; i++) upgrades.purchase('faster-smelting'); // now 2x
      expect(progressFor(SMELT_INGOTS)).toBeCloseTo(0.5, 2); // no retroactive jump
      jasmine.clock().tick(2_000); // +4s of progress at 2x (stops short of paying out)
      expect(progressFor(SMELT_INGOTS)).toBeCloseTo(0.9, 2);
    });

    it('decay after release is unaffected by the speed bonus', () => {
      for (let i = 0; i < 10; i++) upgrades.purchase('faster-smelting');
      crafting.startHold(SMELT_INGOTS);
      jasmine.clock().tick(2_000); // 4s of progress at 2x
      crafting.releaseHold(SMELT_INGOTS);
      jasmine.clock().tick(1_000); // decays 3s (decayMultiplier 3, base rate)
      expect(progressFor(SMELT_INGOTS)).toBeCloseTo(0.1, 2);
    });
  });

  describe('Scrappy Resourcefulness (crafting-refund-chance)', () => {
    function smithOnce(): void {
      for (let i = 0; i < 10; i++) crafting.click(SMITH_METAL);
    }

    it('no levels: no refund', () => {
      wallet.add('ingot', 10);
      smithOnce();
      expect(wallet.getAmount('ingot')).toBe(0);
    });

    it('at max (500%) always refunds exactly 5 Ingots', () => {
      TestBed.inject(UpgradesService).maxAll();
      wallet.add('ingot', 10);
      smithOnce();
      expect(wallet.getAmount('ingot')).toBe(5);
    });

    it('a partial chance rolls: 5% at level 1 refunds on a winning roll only', () => {
      const upgrades = TestBed.inject(UpgradesService);
      wallet.add('gold', 1_000_000);
      wallet.add('ironmongery', 1_000);
      upgrades.purchase('scrappy-resourcefulness');
      wallet.add('ingot', 20);

      spyOn(Math, 'random').and.returnValue(0.01);
      smithOnce();
      expect(wallet.getAmount('ingot')).toBe(11);
    });
  });
});
