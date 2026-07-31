import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlacksmithForgeComponent } from './blacksmith-forge.component';
import { PatternCraftingService } from './pattern-crafting.service';
import { WalletService } from '../economy/wallet.service';

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
});
