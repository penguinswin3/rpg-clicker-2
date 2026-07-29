import { TestBed } from '@angular/core/testing';
import { ButtonZoneComponent } from './button-zone.component';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { StatisticsService } from '../../statistics/statistics.service';
import { WalletService } from '../../economy/wallet.service';
import { UpgradesService } from '../../upgrades/upgrades.service';
import { TimedActionsService, TimedActionState } from '../../timed-actions/timed-actions.service';
import { CHARACTER_ACTIONS, TIMED_ACTIONS, CRAFTING_ACTIONS, TimedActionConfig } from '../../configs/game-config';
import { RESOURCE_FLAVOR } from '../../configs/flavor-text';
import { formatAmount, formatDurationMs } from '../../shared/number-format';

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

  describe('tooltip content', () => {
    function row(rows: { label: string; value: string; color?: string }[], label: string) {
      return rows.find(r => r.label === label);
    }

    describe('primaryActionTooltip', () => {
      const hardLabor = CHARACTER_ACTIONS.find(a => a.id === 'fighter-hard-labor')!;

      it('shows the base yield (no upgrades) and the repeat cadence, with no bonus rows', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const content = fixture.componentInstance.primaryActionTooltip(hardLabor);

        const resource = RESOURCE_FLAVOR[hardLabor.resourceId];
        expect(row(content.rows, 'Yield')).toEqual({
          label: 'Yield',
          value: `+${formatAmount(hardLabor.amountPerAction)} ${resource.symbol}`,
          color: resource.color,
        });
        expect(row(content.rows, 'Repeats')!.value).toContain(formatDurationMs(fixture.componentInstance.autoClickIntervalMs));
        expect(row(content.rows, 'Double Chance')).toBeUndefined();
        expect(row(content.rows, 'Bonus Yield Chance')).toBeUndefined();
      });

      it('reflects a purchased action-amount upgrade (Hard Work) in the yield row', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const wallet = TestBed.inject(WalletService);
        const upgrades = TestBed.inject(UpgradesService);
        wallet.add('gold', 1_000_000);
        upgrades.purchase('hard-work');

        const content = fixture.componentInstance.primaryActionTooltip(hardLabor);
        const bonus = upgrades.getActionAmountBonus(hardLabor.id);
        const resource = RESOURCE_FLAVOR[hardLabor.resourceId];
        expect(row(content.rows, 'Yield')!.value).toBe(`+${formatAmount(hardLabor.amountPerAction + bonus)} ${resource.symbol}`);
      });

      it('shows Double Chance only once a payout-double-chance upgrade (Bonus Payout) is actually leveled', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const wallet = TestBed.inject(WalletService);
        const upgrades = TestBed.inject(UpgradesService);
        upgrades.unlock('bonus-payout');
        wallet.add('gold', 1_000_000);
        upgrades.purchase('bonus-payout');

        const content = fixture.componentInstance.primaryActionTooltip(hardLabor);
        const chance = upgrades.getPayoutDoubleChance(hardLabor.id);
        expect(row(content.rows, 'Double Chance')!.value).toBe(`${Math.round(chance * 100)}%`);
      });
    });

    describe('timedActionTooltip', () => {
      const guildContract = TIMED_ACTIONS.find(a => a.id === 'fighter-guild-contract')!;
      const baitTrap = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;

      it('Guild Contract (fixed duration, no cost): no Cost row, single Duration value, base Yield', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const content = fixture.componentInstance.timedActionTooltip(guildContract);

        expect(row(content.rows, 'Cost')).toBeUndefined();
        expect(row(content.rows, 'Duration')!.value).toBe(formatDurationMs((guildContract.duration as { type: 'fixed'; ms: number }).ms));
        const resource = RESOURCE_FLAVOR[guildContract.reward.resourceId];
        expect(row(content.rows, 'Yield')!.value).toBe(`+${formatAmount(guildContract.reward.amount)} ${resource.symbol}`);
        expect(row(content.rows, 'Collection')).toBeUndefined();
      });

      it('a duration-shortening upgrade (Faster Contracts) is reflected live in the Duration row', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const wallet = TestBed.inject(WalletService);
        const upgrades = TestBed.inject(UpgradesService);
        upgrades.unlock('faster-contracts');
        wallet.add('gold', 1_000_000);
        upgrades.purchase('faster-contracts');

        const content = fixture.componentInstance.timedActionTooltip(guildContract);
        const effectiveMs = upgrades.getTimedActionDurationMs(guildContract);
        expect(content.rows.find(r => r.label === 'Duration')!.value).toBe(formatDurationMs(effectiveMs));
        expect(effectiveMs).toBeLessThan((guildContract.duration as { type: 'fixed'; ms: number }).ms);
      });

      it('Bait Trap (random duration, has cost, requiresCollection, bonusReward): every row present and correct', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const content = fixture.componentInstance.timedActionTooltip(baitTrap);
        const duration = baitTrap.duration as { type: 'random'; minMs: number; maxMs: number };
        const costResource = RESOURCE_FLAVOR[baitTrap.cost!.resourceId];
        const rewardResource = RESOURCE_FLAVOR[baitTrap.reward.resourceId];
        const bonusResource = RESOURCE_FLAVOR[baitTrap.bonusReward!.resourceId];

        expect(row(content.rows, 'Cost')!.value).toBe(`${formatAmount(baitTrap.cost!.amount)} ${costResource.symbol}`);
        expect(row(content.rows, 'Duration')!.value).toBe(`${formatDurationMs(duration.minMs)} - ${formatDurationMs(duration.maxMs)}`);
        expect(row(content.rows, 'Yield')!.value).toBe(`+${formatAmount(baitTrap.reward.amount)} ${rewardResource.symbol}`);
        expect(row(content.rows, 'Bonus Chance')!.value).toBe(`${Math.round(baitTrap.bonusReward!.chance * 100)}% ${bonusResource.symbol}`);
        expect(row(content.rows, 'Collection')!.value).toContain('Manual');
      });
    });

    describe('craftingTooltip', () => {
      it("a 'hold' action (Forge Ingots) shows Cost, Yield, and Hold Time", () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const config = CRAFTING_ACTIONS.find(a => a.id === 'blacksmith-forge-ingots')!;
        const content = fixture.componentInstance.craftingTooltip(config);
        const costResource = RESOURCE_FLAVOR[config.cost.resourceId];
        const rewardResource = RESOURCE_FLAVOR[config.reward.resourceId];

        expect(row(content.rows, 'Cost')!.value).toBe(`${formatAmount(config.cost.amount)} ${costResource.symbol}`);
        expect(row(content.rows, 'Yield')!.value).toBe(`+${formatAmount(config.reward.amount)} ${rewardResource.symbol}`);
        expect(config.mechanic.type).toBe('hold');
        expect(row(content.rows, 'Hold Time')!.value).toBe(formatDurationMs((config.mechanic as { holdMs: number }).holdMs));
        expect(row(content.rows, 'Clicks Required')).toBeUndefined();
      });

      it("a 'clicks' action (Smith Metal) shows Cost, Yield, and Clicks Required", () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const config = CRAFTING_ACTIONS.find(a => a.id === 'blacksmith-smith-metal')!;
        const content = fixture.componentInstance.craftingTooltip(config);

        expect(config.mechanic.type).toBe('clicks');
        expect(row(content.rows, 'Clicks Required')!.value).toBe(`${(config.mechanic as { clicksRequired: number }).clicksRequired}`);
        expect(row(content.rows, 'Hold Time')).toBeUndefined();
      });
    });

    it('every CHARACTER_ACTIONS/TIMED_ACTIONS/CRAFTING_ACTIONS entry produces at least one tooltip row (sanity check)', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      for (const action of CHARACTER_ACTIONS) {
        expect(fixture.componentInstance.primaryActionTooltip(action).rows.length).withContext(action.id).toBeGreaterThan(0);
      }
      for (const timed of TIMED_ACTIONS) {
        expect(fixture.componentInstance.timedActionTooltip(timed).rows.length).withContext(timed.id).toBeGreaterThan(0);
      }
      for (const crafting of CRAFTING_ACTIONS) {
        expect(fixture.componentInstance.craftingTooltip(crafting).rows.length).withContext(crafting.id).toBeGreaterThan(0);
      }
    });
  });
});
