import { TestBed } from '@angular/core/testing';
import { PerSecondCalculatorService } from './per-second-calculator.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { RESOURCES, GENERATORS } from '../configs/game-config';
import { WalletService } from './wallet.service';
import { GameLoopService } from './game-loop.service';
import { CharacterSelectService } from '../character-select/character-select.service';

/** "Per-second rates are accounted for" — the invariant this file exists to guard. */
describe('PerSecondCalculatorService', () => {
  let calculator: PerSecondCalculatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    calculator = TestBed.inject(PerSecondCalculatorService);
  });

  it('returns a defined, finite rate for every registered resource, generator or not', () => {
    for (const resource of RESOURCES) {
      const rate = calculator.getRate(resource.id);
      expect(Number.isFinite(rate)).withContext(resource.id).toBeTrue();
    }
  });

  it('returns 0 and an empty source list for a resource with no generators', () => {
    const generatorResourceIds = new Set(GENERATORS.map(g => g.resourceId));
    for (const resource of RESOURCES.filter(r => !generatorResourceIds.has(r.id))) {
      expect(calculator.getRate(resource.id)).withContext(resource.id).toBe(0);
      expect(calculator.getSources(resource.id)).withContext(resource.id).toEqual([]);
    }
  });

  it('activeResourceIds is exactly the distinct set of resources GENERATORS actually targets', () => {
    const expected = new Set(GENERATORS.map(g => g.resourceId));
    expect(new Set(calculator.activeResourceIds)).toEqual(expected);
  });

  it('a resource\'s rate is the sum of every generator targeting it, each bumped by getGeneratorRateBonus', () => {
    const upgrades = TestBed.inject(UpgradesService);
    for (const resourceId of calculator.activeResourceIds) {
      const generatorsForResource = GENERATORS.filter(g => g.resourceId === resourceId);
      const expectedTotal = generatorsForResource.reduce(
        (sum, g) => sum + g.ratePerSecond + upgrades.getGeneratorRateBonus(g.id),
        0
      );
      expect(calculator.getRate(resourceId)).withContext(resourceId).toBeCloseTo(expectedTotal, 5);
    }
  });

  it('Subcontract: buying levels raises the Gold rate live, +1/s per level, listed as its own source', () => {
    const upgrades = TestBed.inject(UpgradesService);
    TestBed.inject(CharacterSelectService).unlock('ranger');
    TestBed.inject(WalletService).add('raw-meat', 1_000_000);
    expect(calculator.getRate('gold')).toBe(0);

    for (let i = 0; i < 3; i++) upgrades.purchase('subcontract');
    expect(calculator.getRate('gold')).toBe(3);
    expect(calculator.getSources('gold')).toEqual([{ label: 'Subcontract', ratePerSecond: 3 }]);
  });

  it('activeResourceIds is built once — the same array every read (the game loop walks it every tick)', () => {
    expect(calculator.activeResourceIds).toBe(calculator.activeResourceIds);
  });

  it('GameLoop pays the Subcontract rate into the wallet once per second', () => {
    jasmine.clock().install();
    try {
      TestBed.inject(GameLoopService); // starts its 1s interval
      const upgrades = TestBed.inject(UpgradesService);
      const wallet = TestBed.inject(WalletService);
      TestBed.inject(CharacterSelectService).unlock('ranger');
      wallet.add('raw-meat', 1_000_000);
      upgrades.purchase('subcontract');
      upgrades.purchase('subcontract');
      const before = wallet.getAmount('gold');

      jasmine.clock().tick(3_000);
      expect(wallet.getAmount('gold')).toBe(before + 6);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
