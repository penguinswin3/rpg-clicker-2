import { resourceAmountToken, resourceNameToken } from './resource-token';

describe('resourceAmountToken', () => {
  it('wraps a signed amount + symbol in a {{resourceId|...}} token', () => {
    expect(resourceAmountToken('gold', 1)).toBe('{{gold|+1 ᱛ}}');
  });

  it('signs a negative amount without a leading +', () => {
    expect(resourceAmountToken('gold', -5)).toBe('{{gold|-5 ᱛ}}');
  });
});

describe('resourceNameToken', () => {
  it('wraps the symbol + display name in a {{resourceId|...}} token', () => {
    expect(resourceNameToken('ore')).toBe('{{ore|° ORE}}');
  });

  it('uses a different resource id/symbol/name consistently', () => {
    expect(resourceNameToken('bait')).toBe('{{bait|~ BAIT}}');
  });
});
