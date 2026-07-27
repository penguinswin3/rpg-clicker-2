import { TestBed } from '@angular/core/testing';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let wallet: WalletService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    wallet = TestBed.inject(WalletService);
  });

  it('starts every resource at 0 and locked', () => {
    expect(wallet.getAmount('gold')).toBe(0);
    expect(wallet.isUnlocked('gold')).toBeFalse();
  });

  it('add() accumulates and unlocks once the amount goes above 0', () => {
    wallet.add('gold', 5);
    expect(wallet.getAmount('gold')).toBe(5);
    expect(wallet.isUnlocked('gold')).toBeTrue();
  });

  it('stays unlocked even after being spent back down to 0', () => {
    wallet.add('gold', 5);
    wallet.add('gold', -5);
    expect(wallet.getAmount('gold')).toBe(0);
    expect(wallet.isUnlocked('gold')).toBeTrue();
  });

  it('emits {resourceId, delta} on change, and skips the emission entirely for a 0 delta', () => {
    const changes: { resourceId: string; delta: number }[] = [];
    wallet.changes$.subscribe(c => changes.push(c));

    wallet.add('gold', 10);
    wallet.add('gold', 0);
    wallet.add('herbs', -3);

    expect(changes).toEqual([
      { resourceId: 'gold', delta: 10 },
      { resourceId: 'herbs', delta: -3 },
    ]);
  });

  it('round-trips through getSnapshot/restore', () => {
    wallet.add('gold', 42);
    wallet.add('bait', 7);
    const snapshot = wallet.getSnapshot();

    const restored = TestBed.inject(WalletService);
    // Same singleton in this TestBed, so mutate it away from the snapshot first to prove
    // restore() actually overwrites rather than restore() being a no-op that happens to match.
    restored.add('gold', 1000);
    restored.restore(snapshot);

    expect(restored.getAmount('gold')).toBe(42);
    expect(restored.getAmount('bait')).toBe(7);
    expect(restored.isUnlocked('gold')).toBeTrue();
    expect(restored.isUnlocked('bait')).toBeTrue();
  });

  it('restore() emits a delta of 0 for every restored resource (must not inflate lifetime-gained stats)', () => {
    wallet.add('gold', 5);
    const snapshot = wallet.getSnapshot();

    const changes: { resourceId: string; delta: number }[] = [];
    wallet.changes$.subscribe(c => changes.push(c));
    wallet.restore(snapshot);

    expect(changes).toEqual([{ resourceId: 'gold', delta: 0 }]);
  });
});
