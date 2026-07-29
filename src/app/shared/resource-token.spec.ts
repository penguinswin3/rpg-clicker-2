import { resourceAmountToken, resourceNameToken } from './resource-token';
import { RESOURCE_FLAVOR } from '../configs/flavor-text';

// Reads the real symbols from RESOURCE_FLAVOR rather than hardcoding them, so this spec
// doesn't go stale every time a resource's symbol/color is retuned (flavor-text.ts is
// cosmetic data, not a contract these tests should pin down).
describe('resourceAmountToken', () => {
  it('wraps a signed amount + symbol in a {{resourceId|...}} token', () => {
    expect(resourceAmountToken('gold', 1)).toBe(`{{gold|+1 ${RESOURCE_FLAVOR['gold'].symbol}}}`);
  });

  it('signs a negative amount without a leading +', () => {
    expect(resourceAmountToken('gold', -5)).toBe(`{{gold|-5 ${RESOURCE_FLAVOR['gold'].symbol}}}`);
  });
});

describe('resourceNameToken', () => {
  it('wraps the symbol + display name in a {{resourceId|...}} token', () => {
    expect(resourceNameToken('ore')).toBe(`{{ore|${RESOURCE_FLAVOR['ore'].symbol} ORE}}`);
  });

  it('uses a different resource id/symbol/name consistently', () => {
    expect(resourceNameToken('bait')).toBe(`{{bait|${RESOURCE_FLAVOR['bait'].symbol} BAIT}}`);
  });
});
