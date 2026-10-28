import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ButtonZoneComponent } from './button-zone.component';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { StatisticsService } from '../../statistics/statistics.service';
import { WalletService } from '../../economy/wallet.service';
import { UpgradesService } from '../../upgrades/upgrades.service';
import { TimedActionsService, TimedActionState } from '../../timed-actions/timed-actions.service';
import { CraftingService } from '../../crafting/crafting.service';
import { CombatService } from '../../fighter-combat/combat.service';
import { UnlocksService } from '../../shared/unlocks.service';
import { CHARACTER_ACTIONS, TIMED_ACTIONS, CRAFTING_ACTIONS, UPGRADES, TimedActionConfig } from '../../configs/game-config';
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

  describe('onCraftHoldStartKeyboard — Enter/Space parity for the hold-craft button', () => {
    const smeltIngots = CRAFTING_ACTIONS.find(a => a.id === 'blacksmith-smelt-ingots')!;
    const holdState = { config: smeltIngots, progress: 0, costPaid: false };

    it('drives the same CraftingService.startHold a pointer hold does', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const crafting = TestBed.inject(CraftingService);
      spyOn(crafting, 'startHold');

      fixture.componentInstance.onCraftHoldStartKeyboard(new KeyboardEvent('keydown', { key: ' ' }), holdState);

      expect(crafting.startHold).toHaveBeenCalledOnceWith(smeltIngots.id);
    });

    it("preventDefaults the key event — Angular's (keydown.space) binding doesn't, and Space would scroll", () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });

      fixture.componentInstance.onCraftHoldStartKeyboard(event, holdState);

      expect(event.defaultPrevented).toBeTrue();
    });

    it('the hold-craft button wires keydown/keyup Enter and Space alongside its pointer events', () => {
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      const characters = TestBed.inject(CharacterSelectService);
      characters.unlock('blacksmith');
      characters.select('blacksmith');
      fixture.componentInstance.activeCharacterId = 'blacksmith';
      fixture.detectChanges();

      const crafting = TestBed.inject(CraftingService);
      const startHold = spyOn(crafting, 'startHold');
      const releaseHold = spyOn(crafting, 'releaseHold');
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.hold-craft-button');
      expect(button).withContext('Blacksmith should render a hold-craft button').toBeTruthy();

      for (const key of ['Enter', ' ']) {
        startHold.calls.reset();
        releaseHold.calls.reset();

        button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        expect(startHold).withContext(`keydown "${key}"`).toHaveBeenCalled();

        button.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
        expect(releaseHold).withContext(`keyup "${key}"`).toHaveBeenCalled();
      }
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
      it("a 'hold' action (Smelt Ingots) shows Cost, Yield, and Hold Time", () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const config = CRAFTING_ACTIONS.find(a => a.id === 'blacksmith-smelt-ingots')!;
        const content = fixture.componentInstance.craftingTooltip(config);
        const costResource = RESOURCE_FLAVOR[config.cost.resourceId];
        const rewardResource = RESOURCE_FLAVOR[config.reward.resourceId];

        expect(row(content.rows, 'Cost')!.value).toBe(`${formatAmount(config.cost.amount)} ${costResource.symbol}`);
        expect(row(content.rows, 'Yield')!.value).toBe(`+${formatAmount(config.reward.amount)} ${rewardResource.symbol}`);
        expect(config.mechanic.type).toBe('hold');
        expect(row(content.rows, 'Hold Time')!.value).toBe(formatDurationMs((config.mechanic as { holdMs: number }).holdMs));
        expect(row(content.rows, 'Clicks Required')).toBeUndefined();
      });

      it('shows "Paid" in place of the cost amount once the cost is already staged', () => {
        const fixture = TestBed.createComponent(ButtonZoneComponent);
        const config = CRAFTING_ACTIONS.find(a => a.id === 'blacksmith-smelt-ingots')!;
        const content = fixture.componentInstance.craftingTooltip(config, true);
        expect(row(content.rows, 'Cost')!.value).toBe('Paid');
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

  describe('crafting buttons — paid cue', () => {
    it('marks a crafting button .cost-paid once its cost is staged', () => {
      const characters = TestBed.inject(CharacterSelectService);
      const wallet = TestBed.inject(WalletService);
      const crafting = TestBed.inject(CraftingService);
      characters.unlock('blacksmith');
      characters.select('blacksmith');
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();
      const button = (): HTMLElement =>
        fixture.nativeElement.querySelector('[data-testid="crafting-action-blacksmith-smelt-ingots"]');
      expect(button().classList).not.toContain('cost-paid');
      expect(button().style.borderColor).toBe('');

      wallet.add('ore', 10);
      crafting.startHold('blacksmith-smelt-ingots');
      crafting.releaseHold('blacksmith-smelt-ingots');
      fixture.detectChanges();
      expect(button().classList).toContain('cost-paid');
      const probe = document.createElement('div');
      probe.style.borderColor = RESOURCE_FLAVOR['ore'].color;
      expect(button().style.borderColor).toBe(probe.style.borderColor);
    });
  });

  describe('Short Rest', () => {
    const restButton = (fixture: { nativeElement: HTMLElement }): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector('[data-testid="short-rest"]');

    it('is hidden until minigames unlock, then shows for the Fighter only', () => {
      const unlocks = TestBed.inject(UnlocksService);
      const characters = TestBed.inject(CharacterSelectService);
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();
      expect(restButton(fixture)).toBeNull();

      unlocks.unlock('minigames');
      fixture.detectChanges();
      expect(restButton(fixture)).not.toBeNull();

      characters.unlock('ranger');
      characters.select('ranger');
      fixture.detectChanges();
      expect(restButton(fixture)).toBeNull();
    });

    it('is disabled at full HP', () => {
      TestBed.inject(UnlocksService).unlock('minigames');
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();
      expect(restButton(fixture)!.disabled).toBeTrue();
    });

    it('starting a rest interrupts a running Guild Contract; stopping one does not touch it', () => {
      TestBed.inject(UnlocksService).unlock('minigames');
      TestBed.inject(UnlocksService).unlock('guildContract');
      const combat = TestBed.inject(CombatService);
      const timedActions = TestBed.inject(TimedActionsService);
      const contract = () => timedActions.actions.find(a => a.config.id === 'fighter-guild-contract')!;
      combat.restore({ fighterHp: 10, lockedOutUntil: null, activeEncounter: null });
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();

      timedActions.start('fighter-guild-contract');
      fixture.componentInstance.onShortRest();
      expect(combat.resting).toBeTrue();
      expect(contract().running).toBeFalse();

      fixture.componentInstance.onShortRest(); // stop resting
      expect(combat.resting).toBeFalse();
      timedActions.start('fighter-guild-contract');
      fixture.componentInstance.onShortRest(); // rest again — interrupts again
      expect(contract().running).toBeFalse();
    });

    it('a click that cannot start a rest (full HP) leaves a running Guild Contract alone', () => {
      TestBed.inject(UnlocksService).unlock('minigames');
      TestBed.inject(UnlocksService).unlock('guildContract');
      const timedActions = TestBed.inject(TimedActionsService);
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();

      timedActions.start('fighter-guild-contract');
      fixture.componentInstance.onShortRest();
      expect(timedActions.actions.find(a => a.config.id === 'fighter-guild-contract')!.running).toBeTrue();
    });

    it("while resting: aria-pressed, and the Fighter's other buttons are disabled and inert", () => {
      TestBed.inject(UnlocksService).unlock('minigames');
      TestBed.inject(UnlocksService).unlock('guildContract');
      const combat = TestBed.inject(CombatService);
      const wallet = TestBed.inject(WalletService);
      combat.restore({ fighterHp: 10, lockedOutUntil: null, activeEncounter: null });
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();

      restButton(fixture)!.click();
      fixture.detectChanges();

      expect(combat.resting).toBeTrue();
      expect(restButton(fixture)!.getAttribute('aria-pressed')).toBe('true');
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector<HTMLButtonElement>('.primary-button')!.disabled).toBeTrue();
      expect(el.querySelector<HTMLButtonElement>('[data-testid="timed-action-fighter-guild-contract"]')!.disabled).toBeTrue();

      const action = CHARACTER_ACTIONS.find(a => a.characterId === 'fighter')!;
      const before = wallet.getAmount(action.resourceId);
      fixture.componentInstance.onAction();
      expect(wallet.getAmount(action.resourceId)).toBe(before);
    });
  });

  describe('Dense Ore (bonus-amount-chance)', () => {
    function mineOre(random: number): number {
      const characters = TestBed.inject(CharacterSelectService);
      const wallet = TestBed.inject(WalletService);
      characters.unlock('blacksmith');
      characters.select('blacksmith');
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.componentInstance.activeCharacterId = 'blacksmith';
      const before = wallet.getAmount('ore');
      spyOn(Math, 'random').and.returnValue(random);
      fixture.componentInstance.onAction();
      return wallet.getAmount('ore') - before;
    }

    beforeEach(() => {
      const wallet = TestBed.inject(WalletService);
      for (const c of UPGRADES.find(u => u.id === 'dense-ore')!.costs) wallet.add(c.resourceId, 1_000_000);
      for (let i = 0; i < 4; i++) TestBed.inject(UpgradesService).purchase('dense-ore');
    });

    it('a winning 5% roll adds extra Ore equal to the upgrade level', () => {
      expect(mineOre(0.01)).toBe(1 + 4);
    });

    it('a losing roll pays the normal amount', () => {
      expect(mineOre(0.5)).toBe(1);
    });
  });

  describe('Multitasking (auto-start-timed-action)', () => {
    function setup(): { fixture: ComponentFixture<ButtonZoneComponent>; timedActions: TimedActionsService } {
      TestBed.inject(UnlocksService).unlock('guildContract');
      TestBed.inject(WalletService).add('gold', 1_000_000);
      TestBed.inject(UpgradesService).purchase('multitasking'); // 5%
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      return { fixture, timedActions: TestBed.inject(TimedActionsService) };
    }
    const contract = (t: TimedActionsService) => t.actions.find(a => a.config.id === 'fighter-guild-contract')!;

    it('a winning roll on Hard Labor starts an idle Guild Contract', () => {
      const { fixture, timedActions } = setup();
      spyOn(Math, 'random').and.returnValue(0.01);
      fixture.componentInstance.onAction();
      expect(contract(timedActions).running).toBeTrue();
    });

    it('a losing roll leaves it idle', () => {
      const { fixture, timedActions } = setup();
      spyOn(Math, 'random').and.returnValue(0.5);
      fixture.componentInstance.onAction();
      expect(contract(timedActions).running).toBeFalse();
    });

    it('never restarts one already running', () => {
      const { fixture, timedActions } = setup();
      timedActions.start('fighter-guild-contract');
      const startSpy = spyOn(timedActions, 'start').and.callThrough();
      spyOn(Math, 'random').and.returnValue(0.01);
      fixture.componentInstance.onAction();
      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  describe('Bait Trap "Extra Bait" checkbox', () => {
    function render(levels: number) {
      const characters = TestBed.inject(CharacterSelectService);
      characters.unlock('ranger');
      characters.select('ranger');
      const upgrades = TestBed.inject(UpgradesService);
      upgrades.unlock('extra-baiting');
      TestBed.inject(WalletService).add('bait', 1_000_000);
      for (let i = 0; i < levels; i++) upgrades.purchase('extra-baiting');
      const fixture = TestBed.createComponent(ButtonZoneComponent);
      fixture.detectChanges();
      return fixture;
    }
    const box = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="batch-toggle-ranger-bait-trap"]');

    it('is hidden until Extra Baiting is bought (both modes would be identical)', () => {
      expect(box(render(0).nativeElement)).toBeNull();
    });

    it('reads "Extra Bait", is checked by default, and unchecks to one-at-a-time', () => {
      const fixture = render(2);
      const checkbox = box(fixture.nativeElement)!;
      expect(checkbox.textContent).toContain('Extra Bait');
      expect(checkbox.getAttribute('role')).toBe('checkbox');
      expect(checkbox.getAttribute('aria-checked')).toBe('true');

      checkbox.click();
      fixture.detectChanges();
      expect(checkbox.getAttribute('aria-checked')).toBe('false');
      expect(TestBed.inject(TimedActionsService).isSingleMode('ranger-bait-trap')).toBeTrue();
    });

    it('the tooltip follows the mode: cost and yield both scale together', () => {
      const fixture = render(2);
      const config = TIMED_ACTIONS.find(a => a.id === 'ranger-bait-trap')!;
      const rows = () => fixture.componentInstance.timedActionTooltip(config).rows;
      expect(rows().find(r => r.label === 'Cost')!.value).toContain('3');
      expect(rows().find(r => r.label === 'Yield')!.value).toContain('+3');

      TestBed.inject(TimedActionsService).setSingleMode('ranger-bait-trap', true);
      expect(rows().find(r => r.label === 'Cost')!.value).toContain('1');
      expect(rows().find(r => r.label === 'Yield')!.value).toContain('+1');
    });
  });
});
