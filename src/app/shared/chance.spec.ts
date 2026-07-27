import { resolveExcessCount } from './chance';

describe('resolveExcessCount', () => {
  it('never succeeds when chance is 0', () => {
    for (let i = 0; i < 50; i++) expect(resolveExcessCount(0)).toBe(0);
  });

  it('rolls probabilistically for a fractional chance under 1.0', () => {
    const samples = Array.from({ length: 2000 }, () => resolveExcessCount(0.3));
    expect(samples.every(n => n === 0 || n === 1)).toBeTrue();
    const successRate = samples.filter(n => n === 1).length / samples.length;
    // Statistical, not exact — generous tolerance to avoid a flaky test.
    expect(successRate).toBeGreaterThan(0.2);
    expect(successRate).toBeLessThan(0.4);
  });

  it('guarantees floor(chance) successes and rolls the remainder for one more', () => {
    // 1.5 -> guaranteed 1, then a 50% roll for a 2nd.
    const samples = Array.from({ length: 2000 }, () => resolveExcessCount(1.5));
    expect(samples.every(n => n === 1 || n === 2)).toBeTrue();
    const bothRate = samples.filter(n => n === 2).length / samples.length;
    expect(bothRate).toBeGreaterThan(0.35);
    expect(bothRate).toBeLessThan(0.65);
  });

  it('guarantees exactly 2 successes for a chance of exactly 2.0 (no remainder to roll)', () => {
    for (let i = 0; i < 50; i++) expect(resolveExcessCount(2)).toBe(2);
  });

  it('handles a large cascading chance (e.g. Better Offcuts near its 100-level cap)', () => {
    // 100 levels * 5%/level = 5.0 -> guaranteed 5, then a 0% roll for a 6th.
    for (let i = 0; i < 50; i++) expect(resolveExcessCount(5.0)).toBe(5);
  });
});
