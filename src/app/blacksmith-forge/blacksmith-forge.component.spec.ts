import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlacksmithForgeComponent } from './blacksmith-forge.component';
import { PatternCraftingService } from './pattern-crafting.service';
import { WalletService } from '../economy/wallet.service';

function findRow(fixture: ComponentFixture<BlacksmithForgeComponent>, slotLabelText: string): HTMLElement {
  const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.pattern-row'));
  return rows.find(r => r.querySelector('.pattern-slot-label')?.textContent?.trim() === slotLabelText)!;
}

describe('BlacksmithForgeComponent', () => {
  let fixture: ComponentFixture<BlacksmithForgeComponent>;
  let patternCrafting: PatternCraftingService;
  let wallet: WalletService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BlacksmithForgeComponent] });
    fixture = TestBed.createComponent(BlacksmithForgeComponent);
    patternCrafting = TestBed.inject(PatternCraftingService);
    wallet = TestBed.inject(WalletService);
    fixture.detectChanges();
  });

  it('renders one row per known pattern, each with an enabled Craft button', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.pattern-row').length).toBe(5);
    const buttons = el.querySelectorAll<HTMLButtonElement>('.craft-button');
    expect(buttons.length).toBe(5);
    buttons.forEach(b => expect(b.disabled).toBeFalse());
  });

  it('gives every Craft button the same fixed min-width, regardless of its current label', () => {
    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.craft-button'));
    const widths = buttons.map(b => b.style.minWidth);

    expect(widths[0]).toBeTruthy();
    widths.forEach(w => expect(w).toBe(widths[0]));

    // Sanity check it's sized generously enough to hold the longest label ("Crafting...")
    // — a plain 11 doesn't fit "11ch", but the button's own computed width should.
    wallet.add('ironmongery', 5);
    wallet.add('ingot', 5);
    fixture.detectChanges();
    (el.querySelector('[data-testid="pattern-craft-pattern-common-weapon"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const widthsAfter = Array.from(el.querySelectorAll<HTMLButtonElement>('.craft-button')).map(b => b.style.minWidth);
    // Now showing a mix of "Crafting..." (the active one) and "Forge Busy" (the rest) —
    // still every button must share the exact same width as before starting.
    widthsAfter.forEach(w => expect(w).toBe(widths[0]));
  });

  it('shows "-- not forged --" for every pattern with no owned item yet', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.pattern-none').length).toBe(5);
  });

  it('clicking Craft on an affordable pattern starts it and disables every row', () => {
    wallet.add('ironmongery', 5);
    wallet.add('ingot', 5);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="pattern-craft-pattern-common-weapon"]'
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const buttons = el.querySelectorAll<HTMLButtonElement>('.craft-button');
    buttons.forEach(b => expect(b.disabled).toBeTrue());
  });

  it('clicking Craft on an unaffordable pattern does not start a craft', () => {
    const button = fixture.nativeElement.querySelector(
      '[data-testid="pattern-craft-pattern-common-weapon"]'
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(patternCrafting.patterns.some(p => p.active)).toBeFalse();
  });

  it('shows color-coded cost entries on the row for each unowned pattern', () => {
    const weaponRow = findRow(fixture, 'Weapon'); // pattern-common-weapon: 5 ironmongery + 5 ingot
    const costEntries = weaponRow.querySelectorAll<HTMLElement>('.cost-entry');

    expect(costEntries.length).toBe(2);
    expect(costEntries[0].textContent?.trim()).toBe('5 ⛭');
    expect(costEntries[0].style.color).toBeTruthy();
    expect(costEntries[1].textContent?.trim()).toBe('5 =');
    expect(costEntries[1].style.color).toBeTruthy();
    // The two resources get visibly different colors, not one flat "cost" color.
    expect(costEntries[0].style.color).not.toBe(costEntries[1].style.color);
  });

  it('hides the on-row cost display once a pattern is owned (via a real completed craft)', () => {
    // jasmine.clock() must install *before* PatternCraftingService is constructed —
    // its constructor registers a real setInterval, and jasmine.clock() only fakes
    // timers created after install() — so this test needs its own fresh TestBed/fixture
    // rather than the shared beforeEach's (already-constructed) one.
    TestBed.resetTestingModule();
    jasmine.clock().install();
    jasmine.clock().mockDate();
    TestBed.configureTestingModule({ imports: [BlacksmithForgeComponent] });
    const freshFixture = TestBed.createComponent(BlacksmithForgeComponent);
    const freshWallet = TestBed.inject(WalletService);
    const freshPatternCrafting = TestBed.inject(PatternCraftingService);
    freshFixture.detectChanges();

    freshWallet.add('ironmongery', 5);
    freshWallet.add('ingot', 5);
    freshPatternCrafting.start('pattern-common-weapon');
    jasmine.clock().tick(60_000);
    freshFixture.detectChanges();
    jasmine.clock().uninstall();

    const weaponRow = findRow(freshFixture, 'Weapon');
    expect(weaponRow.querySelectorAll('.cost-entry').length).toBe(0);
  });
});
