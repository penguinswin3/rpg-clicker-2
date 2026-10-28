import { formatDropRate } from './number-format';

describe('formatDropRate', () => {
  it('defaults to 1/N, whole denominators without a decimal', () => {
    expect(formatDropRate(0.05, false)).toBe('1/20');
    expect(formatDropRate(0.0001, false)).toBe('1/10000');
  });

  it('keeps one decimal for a non-whole denominator', () => {
    expect(formatDropRate(0.6, false)).toBe('1/1.7');
  });

  it('as a percent keeps up to two decimals, trailing zeros dropped', () => {
    expect(formatDropRate(0.05, true)).toBe('5%');
    expect(formatDropRate(0.6, true)).toBe('60%');
    expect(formatDropRate(0.0001, true)).toBe('0.01%');
    expect(formatDropRate(0.12345, true)).toBe('12.35%');
  });

  it('a guaranteed drop reads "Always" in either format', () => {
    expect(formatDropRate(1, false)).toBe('Always');
    expect(formatDropRate(1, true)).toBe('Always');
  });
});
