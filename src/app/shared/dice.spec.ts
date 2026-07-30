import { rollDie, rollD20 } from './dice';

describe('rollDie', () => {
  it('returns 1 when Math.random returns 0', () => {
    spyOn(Math, 'random').and.returnValue(0);
    expect(rollDie(20)).toBe(1);
  });

  it('returns sides when Math.random returns just under 1', () => {
    spyOn(Math, 'random').and.returnValue(0.9999999);
    expect(rollDie(6)).toBe(6);
  });

  it('always returns an integer within [1, sides]', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollDie(20);
      expect(Number.isInteger(roll)).toBe(true);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });
});

describe('rollD20', () => {
  it('is equivalent to rollDie(20)', () => {
    spyOn(Math, 'random').and.returnValue(0.5);
    expect(rollD20()).toBe(rollDie(20));
  });

  it('stays within [1, 20] over many rolls', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollD20();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });
});
