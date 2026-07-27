import { TestBed } from '@angular/core/testing';
import { UpgradesService } from './upgrades.service';
import { WalletService } from '../economy/wallet.service';
import { UPGRADES, TIMED_ACTIONS } from '../configs/game-config';

describe('UpgradesService', () => {
  let upgrades: UpgradesService;
  let wallet: WalletService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    upgrades = TestBed.inject(UpgradesService);
    wallet = TestBed.inject(WalletService);
  });

  it('starts every upgrade at level 0, with `unlocked: true` upgrades already visible', () => {
    expect(upgrades.getLevel('hard-work')).toBe(0);
    expect(upgrades.isUnlocked('hard-work')).toBeTrue();
    // better-offcuts is gated behind the unlock-ranger objective (unlocked: false in config).
    expect(upgrades.isUnlocked('better-offcuts')).toBeFalse();
  });

  it('unlock() is idempotent and re-unlocking an already-unlocked upgrade is a no-op', () => {
    upgrades.unlock('better-offcuts');
    expect(upgrades.isUnlocked('better-offcuts')).toBeTrue();
    expect(() => upgrades.unlock('better-offcuts')).not.toThrow();
    expect(upgrades.isUnlocked('better-offcuts')).toBeTrue();
  });

  describe('cost curve', () => {
    it('costFor() follows ceil(baseCost * costScalingFactor^level)', () => {
      const config = UPGRADES.find(u => u.id === 'hard-work')!;
      expect(upgrades.costFor(config)).toBe(config.baseCost);

      wallet.add('gold', 1_000_000);
      upgrades.purchase('hard-work');
      const expectedLevel1Cost = Math.ceil(config.baseCost * Math.pow(config.costScalingFactor, 1));
      expect(upgrades.costFor(config)).toBe(expectedLevel1Cost);
    });

    it('returns undefined once maxLevel is reached', () => {
      upgrades.maxAll();
      const config = UPGRADES.find(u => u.id === 'hard-work')!;
      expect(upgrades.costFor(config)).toBeUndefined();
      expect(upgrades.upgrades.find(u => u.config.id === 'hard-work')!.maxed).toBeTrue();
    });
  });

  describe('purchase()', () => {
    it('no-ops (returns undefined) if locked', () => {
      expect(upgrades.isUnlocked('better-offcuts')).toBeFalse();
      wallet.add('gold', 1_000_000);
      expect(upgrades.purchase('better-offcuts')).toBeUndefined();
      expect(upgrades.getLevel('better-offcuts')).toBe(0);
    });

    it('no-ops (returns undefined) if unaffordable, and charges nothing', () => {
      expect(wallet.getAmount('gold')).toBe(0);
      expect(upgrades.purchase('hard-work')).toBeUndefined();
      expect(upgrades.getLevel('hard-work')).toBe(0);
      expect(wallet.getAmount('gold')).toBe(0);
    });

    it('charges the exact cost and increments the level by exactly 1', () => {
      wallet.add('gold', 1_000_000);
      const before = wallet.getAmount('gold');
      const charged = upgrades.purchase('hard-work');

      expect(charged).toBe(10); // baseCost at level 0
      expect(wallet.getAmount('gold')).toBe(before - 10);
      expect(upgrades.getLevel('hard-work')).toBe(1);
    });
  });

  describe('getActionAmountBonus', () => {
    it('sums amountPerLevel * level across every action-amount upgrade targeting the action', () => {
      wallet.add('gold', 1_000_000);
      for (let i = 0; i < 3; i++) upgrades.purchase('hard-work');
      expect(upgrades.getActionAmountBonus('fighter-hard-labor')).toBe(3); // +1/level
      expect(upgrades.getActionAmountBonus('nonexistent-action')).toBe(0);
    });
  });

  describe('getPayoutDoubleChance (capped, single-roll)', () => {
    it('clamps the summed chance at 1.0 (100%) even past that many levels', () => {
      upgrades.unlock('bonus-payout');
      wallet.add('gold', 10_000_000);
      // bonus-payout: chancePerLevel 0.1, maxLevel 10 -> 100% at max, never above.
      upgrades.maxAll();
      expect(upgrades.getPayoutDoubleChance('fighter-hard-labor')).toBe(1);
    });
  });

  describe('getCascadingDoubleChance / getBonusRewardChance (uncapped, excess-percent)', () => {
    it('does NOT clamp at 1.0 — grows past 100% linearly with level', () => {
      upgrades.unlock('better-offcuts');
      wallet.add('gold', 10_000_000);
      for (let i = 0; i < 30; i++) upgrades.purchase('better-offcuts'); // 30 * 5% = 150%
      expect(upgrades.getCascadingDoubleChance('ranger-cut-bait')).toBeCloseTo(1.5, 5);
    });

    it('getBonusRewardChance is 0 with no upgrade levels and grows per level once purchased', () => {
      expect(upgrades.getBonusRewardChance('ranger-bait-trap')).toBe(0);
      upgrades.unlock('clean-traps');
      wallet.add('gold', 10_000_000);
      upgrades.purchase('clean-traps');
      expect(upgrades.getBonusRewardChance('ranger-bait-trap')).toBeCloseTo(0.05, 5);
    });
  });

  describe('getTimedActionDurationMs', () => {
    const guildContract = TIMED_ACTIONS.find(a => a.id === 'fighter-guild-contract')!;

    it('returns the fixed base duration with no upgrades purchased', () => {
      expect(upgrades.getTimedActionDurationMs(guildContract)).toBe(10_000);
    });

    it('applies multiplicative decay per level for a fixed duration (Faster Contracts)', () => {
      upgrades.unlock('faster-contracts');
      wallet.add('gold', 10_000_000);
      upgrades.purchase('faster-contracts');
      // decayPerLevel 0.1 at level 1: 10_000 * (1 - 0.1)^1 = 9000
      expect(upgrades.getTimedActionDurationMs(guildContract)).toBeCloseTo(9000, 5);
    });

    it('uses the passed rolledMs (not the config range) as the base for a random duration', () => {
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      expect(upgrades.getTimedActionDurationMs(baitTrap, 7000)).toBe(7000);
    });

    it('falls back to the range midpoint for a random duration with no roll supplied', () => {
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      if (baitTrap.duration.type === 'random') {
        const midpoint = (baitTrap.duration.minMs + baitTrap.duration.maxMs) / 2;
        expect(upgrades.getTimedActionDurationMs(baitTrap)).toBe(midpoint);
      }
    });
  });

  describe('dev tools', () => {
    it('maxAll sets every upgrade to its maxLevel', () => {
      upgrades.maxAll();
      for (const config of UPGRADES) expect(upgrades.getLevel(config.id)).toBe(config.maxLevel);
    });

    it('halveAll rounds up so a maxLevel of 1 still lands on 1, not 0', () => {
      upgrades.halveAll();
      for (const config of UPGRADES) {
        expect(upgrades.getLevel(config.id)).toBe(Math.max(1, Math.ceil(config.maxLevel / 2)));
      }
    });

    it('resetAll zeroes every upgrade', () => {
      upgrades.maxAll();
      upgrades.resetAll();
      for (const config of UPGRADES) expect(upgrades.getLevel(config.id)).toBe(0);
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips levels and unlock state', () => {
      wallet.add('gold', 1_000_000);
      upgrades.purchase('hard-work');
      upgrades.unlock('better-offcuts');
      const snapshot = upgrades.getSnapshot();

      upgrades.resetAll();
      upgrades.restore(snapshot);

      expect(upgrades.getLevel('hard-work')).toBe(1);
      expect(upgrades.isUnlocked('better-offcuts')).toBeTrue();
    });

    it('accepts a pre-unlock-system save (a bare Record<string, number> of levels)', () => {
      const legacySnapshot = { 'hard-work': 4 };
      upgrades.restore(legacySnapshot);

      expect(upgrades.getLevel('hard-work')).toBe(4);
      // Falls back to each upgrade's config default for unlock state, same as a fresh game.
      expect(upgrades.isUnlocked('hard-work')).toBeTrue();
      expect(upgrades.isUnlocked('better-offcuts')).toBeFalse();
    });
  });
});
