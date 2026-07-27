import { TestBed } from '@angular/core/testing';
import { PerSecondCalculatorService } from './per-second-calculator.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { RESOURCES, GENERATORS } from '../configs/game-config';

/**
 * "Per-second rates are accounted for" — the invariant this file exists to guard.
 * GENERATORS is empty today (see AGENTS.md §7) so most of this is necessarily about
 * shape/coverage rather than real numbers; the moment a real generator is registered,
 * `getRate`/`getSources` on its resource should start returning something non-trivial and
 * these same assertions keep holding without changes.
 */
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
    if (GENERATORS.length === 0) {
      // Nothing to exercise yet (see AGENTS.md §7) — `pending()` rather than a fake
      // assertion, so this reads as "not yet applicable," not a false pass. Revisit the
      // instant the first real generator is registered.
      pending('GENERATORS is currently empty — no generator exists yet to sum rates for.');
    }

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

  // No 'generator-rate' upgrade or populated GENERATORS exists yet to exercise the
  // "recompute live when upgrades change" behavior end-to-end (see AGENTS.md §7) — add a
  // real test here (start from a fake/real generator + matching upgrade, buy a level,
  // assert getRate changes without re-subscribing) the moment the first one is registered,
  // rather than a synthetic placeholder that doesn't actually exercise anything.
});
