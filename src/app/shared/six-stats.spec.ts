import { getMaxHp, SixStats } from './six-stats';

describe('getMaxHp', () => {
  it('returns constitution times 10', () => {
    const stats: SixStats = {
      strength: 15, dexterity: 13, constitution: 14,
      intelligence: 8, wisdom: 10, charisma: 12,
    };
    expect(getMaxHp(stats)).toBe(140);
  });

  it('handles zero constitution', () => {
    const stats: SixStats = {
      strength: 1, dexterity: 1, constitution: 0,
      intelligence: 1, wisdom: 1, charisma: 1,
    };
    expect(getMaxHp(stats)).toBe(0);
  });
});
